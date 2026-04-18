/*
 * midi.c — Parser MIDI + secuenciador con salida configurable
 * Default: MPU-401 via mpu_send / mpu_all_notes_off.
 * Cambiar destino con midi_set_output() (p.ej. para OPL2).
 */
#include <string.h>
#include "midi.h"
#include "mpu.h"

/* Punteros de salida — apuntan a MPU-401 por defecto */
static void (*g_midi_send_fn)(unsigned char) = mpu_send;
static void (*g_midi_notes_off_fn)(void)     = mpu_all_notes_off;

void midi_set_output(void (*send_fn)(unsigned char),
                     void (*notes_off_fn)(void)) {
    g_midi_send_fn      = send_fn      ? send_fn      : mpu_send;
    g_midi_notes_off_fn = notes_off_fn ? notes_off_fn : mpu_all_notes_off;
}

static unsigned char  g_mid_buf[MIDI_MAX_SIZE];
static unsigned long  g_mid_size   = 0;
static int            g_playing    = 0;
static int            g_paused     = 0;
static int            g_loop       = 0;
static unsigned long  g_tempo      = 500000UL;
static unsigned short g_ppq        = 96;

#define MAX_TRACKS 32
typedef struct {
    const unsigned char *ptr;
    const unsigned char *end;
    unsigned long  abs_tick;
    unsigned long  cur_tick;
    unsigned char  last_status;
    int            done;
} Track;

static Track          g_tracks[MAX_TRACKS];
static int            g_num_tracks = 0;
static unsigned long  g_global_tick= 0;
static unsigned long  g_us_accum   = 0;
static unsigned long  g_us_per_tick= 0;

static unsigned long _read_vlq(const unsigned char **p, const unsigned char *end) {
    unsigned long val = 0;
    while (*p < end) {
        unsigned char b = **p; (*p)++;
        val = (val << 7) | (b & 0x7F);
        if (!(b & 0x80)) break;
    }
    return val;
}

static unsigned long _read_be32(const unsigned char *p) {
    return ((unsigned long)p[0]<<24)|((unsigned long)p[1]<<16)|
           ((unsigned long)p[2]<<8)|(unsigned long)p[3];
}

static unsigned short _read_be16(const unsigned char *p) {
    return (unsigned short)(((unsigned)p[0]<<8)|(unsigned)p[1]);
}

static void _recalc_timing(void) {
    if (g_ppq == 0) g_ppq = 96;
    g_us_per_tick = g_tempo / g_ppq;
    if (g_us_per_tick == 0) g_us_per_tick = 1;
}

int midi_load(const unsigned char *buf, unsigned long size) {
    const unsigned char *p = buf;
    const unsigned char *end = buf + size;
    unsigned short fmt, ntrk, ppq_raw;
    int t;

    if (size > MIDI_MAX_SIZE || size < 14) return -1;
    if (p[0]!='M'||p[1]!='T'||p[2]!='h'||p[3]!='d') return -1;

    memcpy(g_mid_buf, buf, (unsigned)size);
    g_mid_size = size;
    p = g_mid_buf; end = g_mid_buf + size;

    p += 8;
    fmt     = _read_be16(p); p += 2;
    ntrk    = _read_be16(p); p += 2;
    ppq_raw = _read_be16(p); p += 2;

    if (ppq_raw & 0x8000) return -1;
    g_ppq = ppq_raw;
    if (g_ppq == 0) g_ppq = 96;
    if (ntrk > MAX_TRACKS) ntrk = MAX_TRACKS;
    g_num_tracks = 0;

    for (t = 0; t < ntrk && p + 8 <= end; t++) {
        unsigned long tlen;
        if (p[0]!='M'||p[1]!='T'||p[2]!='r'||p[3]!='k') {
            tlen = _read_be32(p+4); p += 8 + tlen; continue;
        }
        tlen = _read_be32(p+4); p += 8;
        if (p + tlen > end) tlen = (unsigned long)(end - p);
        g_tracks[g_num_tracks].ptr         = p;
        g_tracks[g_num_tracks].end         = p + tlen;
        g_tracks[g_num_tracks].cur_tick    = 0;
        g_tracks[g_num_tracks].abs_tick    = 0;
        g_tracks[g_num_tracks].last_status = 0;
        g_tracks[g_num_tracks].done        = 0;
        { unsigned long d = _read_vlq(&g_tracks[g_num_tracks].ptr, g_tracks[g_num_tracks].end);
          g_tracks[g_num_tracks].abs_tick = d; }
        p += tlen;
        g_num_tracks++;
    }

    g_tempo = 500000UL; g_global_tick = 0; g_us_accum = 0;
    _recalc_timing();
    return 0;
}

void midi_play(void)  { g_playing = 1; g_paused = 0; }
void midi_pause(void)  { if(g_playing){g_paused=1;g_playing=0;g_midi_notes_off_fn();} }
int  midi_is_playing(void) { return g_playing; }
int  midi_is_paused (void) { return g_paused;  }
void midi_set_loop  (int l){ g_loop = l; }
void midi_set_volume(unsigned char vol) {
    /* Enviar CC7 (Main Volume) en los 16 canales MIDI via la salida activa.
     * Funciona tanto para MPU-401 (externo) como para OPL2 si se redirige. */
    int ch;
    for (ch = 0; ch < 16; ch++) {
        g_midi_send_fn((unsigned char)(0xB0 | ch)); /* Control Change canal ch */
        g_midi_send_fn(0x07);                        /* Controller 7 = Main Volume */
        g_midi_send_fn(vol);                         /* Valor 0-127 */
    }
}

void midi_stop(void) {
    int t;
    g_playing = 0; g_paused = 0;
    g_midi_notes_off_fn();
    for(t=0;t<g_num_tracks;t++) g_tracks[t].done = 1;
}

/* Re-parsea el buffer ya cargado y deja el secuenciador listo para play. */
int midi_rewind(void) {
    if (g_mid_size == 0) return -1;
    if (midi_load(g_mid_buf, g_mid_size) != 0) return -1;
    g_playing = 0;
    g_paused  = 0;
    return 0;
}

/* Rebobina y reproduce desde el principio. */
int midi_replay(void) {
    if (midi_rewind() != 0) return -1;
    midi_play();
    return 0;
}

void midi_tick(unsigned long us_elapsed) {
    unsigned long ticks_to_advance;
    int all_done, t;

    if (!g_playing || g_paused) return;

    g_us_accum += us_elapsed;
    ticks_to_advance = g_us_accum / g_us_per_tick;
    if (ticks_to_advance == 0) return;
    g_us_accum -= ticks_to_advance * g_us_per_tick;

    while (ticks_to_advance > 0) {
        ticks_to_advance--;
        g_global_tick++;

        for (t = 0; t < g_num_tracks; t++) {
            Track *trk = &g_tracks[t];
            if (trk->done) continue;

            while (trk->abs_tick <= g_global_tick && !trk->done) {
                unsigned char status, type, ch;
                const unsigned char *p = trk->ptr;
                const unsigned char *end = trk->end;

                if (p >= end) { trk->done = 1; break; }

                status = *p;
                if (status & 0x80) { trk->last_status = status; p++; }
                else { status = trk->last_status; }
                trk->ptr = p;

                type = status & 0xF0; ch = status & 0x0F;

                if (status == 0xFF) {
                    unsigned char mtype; unsigned long mlen;
                    if (trk->ptr >= end) { trk->done=1; break; }
                    mtype = *trk->ptr++;
                    mlen = _read_vlq(&trk->ptr, end);
                    if (mtype == 0x51 && mlen >= 3) {
                        g_tempo = ((unsigned long)trk->ptr[0]<<16)|
                                  ((unsigned long)trk->ptr[1]<<8)|(unsigned long)trk->ptr[2];
                        if (!g_tempo) g_tempo = 500000UL;
                        _recalc_timing();
                    }
                    if (mtype == 0x2F) { trk->done=1; break; }
                    trk->ptr += mlen;
                } else if (type==0xF0||type==0xF7) {
                    unsigned long slen = _read_vlq(&trk->ptr, end);
                    trk->ptr += slen;
                } else if (type==0x90) {
                    if (trk->ptr+2>end){trk->done=1;break;}
                    g_midi_send_fn(status); g_midi_send_fn(trk->ptr[0]); g_midi_send_fn(trk->ptr[1]);
                    trk->ptr += 2;
                } else if (type==0x80) {
                    if (trk->ptr+2>end){trk->done=1;break;}
                    g_midi_send_fn(status); g_midi_send_fn(trk->ptr[0]); g_midi_send_fn(trk->ptr[1]);
                    trk->ptr += 2;
                } else if (type==0xC0) {
                    if (trk->ptr+1>end){trk->done=1;break;}
                    g_midi_send_fn(status); g_midi_send_fn(*trk->ptr++);
                } else if (type==0xB0) {
                    if (trk->ptr+2>end){trk->done=1;break;}
                    g_midi_send_fn(status); g_midi_send_fn(trk->ptr[0]); g_midi_send_fn(trk->ptr[1]);
                    trk->ptr += 2;
                } else if (type==0xE0) {
                    if (trk->ptr+2>end){trk->done=1;break;}
                    g_midi_send_fn(status); g_midi_send_fn(trk->ptr[0]); g_midi_send_fn(trk->ptr[1]);
                    trk->ptr += 2;
                } else if (type==0xA0) { trk->ptr+=2; }
                  else if (type==0xD0) { trk->ptr+=1; }
                  else { trk->ptr++; }

                if (!trk->done && trk->ptr < end) {
                    unsigned long d = _read_vlq(&trk->ptr, end);
                    trk->abs_tick = g_global_tick + d;
                } else { trk->done=1; }
            }
        }

        all_done = 1;
        for(t=0;t<g_num_tracks;t++) if(!g_tracks[t].done){all_done=0;break;}
        if (all_done) {
            if (g_loop) { midi_load(g_mid_buf, g_mid_size); midi_play(); }
            else { g_playing=0; g_midi_notes_off_fn(); }
            return;
        }
    }
}


/* ── Soporte XMI (FORM XMID) ─────────────────────────────────────────
 * Convierte XMI a MIDI en memoria para poder reproducirlo.
 * XMI = IFF container con EVNT chunk que contiene eventos MIDI.
 * Los NoteOn en XMI llevan la duracion inline despues del velocity.
 * Los deltas son en ticks con PPQ=60 implicito.
 */

/* Buscar chunk por tag en buffer IFF */
static const unsigned char *_iff_find(const unsigned char *buf, unsigned long size,
                                       const char *tag) {
    const unsigned char *p = buf;
    const unsigned char *end = buf + size;
    while (p + 8 <= end) {
        unsigned long csz = ((unsigned long)p[4]<<24)|((unsigned long)p[5]<<16)|
                            ((unsigned long)p[6]<<8)|(unsigned long)p[7];
        if (p[0]==tag[0]&&p[1]==tag[1]&&p[2]==tag[2]&&p[3]==tag[3])
            return p;
        p += 8 + csz + (csz & 1);
    }
    return 0;
}

/* Escribir VLQ en buffer */
static int _write_vlq(unsigned char *out, unsigned long val) {
    unsigned char tmp[4]; int n=0, i;
    if (val == 0) { out[0]=0; return 1; }
    while (val > 0) { tmp[n++] = val & 0x7F; val >>= 7; }
    for (i = n-1; i >= 0; i--) {
        out[n-1-i] = tmp[i];
        if (i > 0) out[n-1-i] |= 0x80;
    }
    return n;
}

/* Convertir XMI a MIDI format 0 en g_mid_buf.
   Retorna numero de bytes escritos o -1 si error. */
static int _xmi_to_midi(const unsigned char *xmi, unsigned long xmi_size) {
    const unsigned char *evnt = NULL;
    unsigned long evnt_size = 0;
    const unsigned char *p, *end;
    unsigned char *out;
    unsigned long out_pos;
    unsigned long out_max;

    /* Buscar EVNT: navegar FORM XMID > EVNT */
    {
        const unsigned char *x = xmi;
        unsigned long xs = xmi_size;
        /* Si empieza con FORM XDIR, saltar al CAT/FORM XMID */
        if (xs > 12 && x[0]=='F'&&x[1]=='O'&&x[2]=='R'&&x[3]=='M'&&
            x[8]=='X'&&x[9]=='D'&&x[10]=='I'&&x[11]=='R') {
            x += 12; xs -= 12;
        }
        /* FORM XMID */
        if (xs > 12 && x[0]=='F'&&x[1]=='O'&&x[2]=='R'&&x[3]=='M'&&
            x[8]=='X'&&x[9]=='M'&&x[10]=='I'&&x[11]=='D') {
            x += 12; xs -= 12;
        }
        /* Buscar EVNT */
        {
            const unsigned char *e = _iff_find(x, xs, "EVNT");
            if (!e) return -1;
            evnt = e + 8;
            evnt_size = ((unsigned long)e[4]<<24)|((unsigned long)e[5]<<16)|
                        ((unsigned long)e[6]<<8)|(unsigned long)e[7];
        }
    }

    /* Convertir EVNT a track MIDI:
       XMI: delta(VLQ) status data [duration(VLQ) si NoteOn]
       MIDI: delta(VLQ) status data [NoteOff al final] */

    out = g_mid_buf;
    out_max = MIDI_MAX_SIZE;

    /* Escribir cabecera MIDI format 0, PPQ=60 */
    if (out_max < 22) return -1;
    memcpy(out, "MThd", 4);
    out[4]=0;out[5]=0;out[6]=0;out[7]=6; /* size=6 */
    out[8]=0;out[9]=0;  /* format 0 */
    out[10]=0;out[11]=1; /* 1 track */
    out[12]=0;out[13]=60; /* PPQ=60 */
    out_pos = 14;

    /* Reservar espacio para MTrk header (escribiremos size al final) */
    memcpy(out+out_pos, "MTrk", 4); out_pos += 4;
    unsigned long trk_size_pos = out_pos;
    out_pos += 4; /* placeholder size */

    unsigned long trk_start = out_pos;

    /* Parsear EVNT y generar eventos MIDI */
    /* Para NoteOn, generamos NoteOff diferido: lista simple */
#define MAX_PENDING 64
    struct { unsigned long off_tick; unsigned char ch, note; } pending[MAX_PENDING];
    int n_pending = 0;
    unsigned long cur_tick = 0;

    p = evnt; end = evnt + evnt_size;

    while (p < end) {
        unsigned long delta = 0, i;
        unsigned long next_tick;
        /* Leer delta */
        { const unsigned char *pp = p;
          delta = _read_vlq(&pp, end);
          p = pp; }
        next_tick = cur_tick + delta;

        /* Emitir NoteOff pendientes que vencen antes o en next_tick */
        /* (simplificado: emitirlos en orden) */
        for (i = 0; i < (unsigned long)n_pending; i++) {
            if (pending[i].off_tick <= next_tick) {
                unsigned long dt = pending[i].off_tick > cur_tick ?
                                   pending[i].off_tick - cur_tick : 0;
                unsigned char tmp[8]; int vl;
                vl = _write_vlq(tmp, dt);
                if (out_pos + vl + 3 >= out_max) goto done;
                memcpy(out+out_pos, tmp, vl); out_pos += vl;
                out[out_pos++] = 0x80 | pending[i].ch;
                out[out_pos++] = pending[i].note;
                out[out_pos++] = 0;
                cur_tick = pending[i].off_tick;
                /* Eliminar de pending */
                { int j;
                  for(j=i;j<n_pending-1;j++) pending[j]=pending[j+1];
                  n_pending--; i--; }
            }
        }

        if (p >= end) break;

        /* Escribir delta al siguiente evento */
        { unsigned char tmp[8]; int vl;
          unsigned long dt = next_tick > cur_tick ? next_tick - cur_tick : 0;
          vl = _write_vlq(tmp, dt);
          if (out_pos + vl + 4 >= out_max) goto done;
          memcpy(out+out_pos, tmp, vl); out_pos += vl;
          cur_tick = next_tick; }

        /* Leer status */
        if (p >= end) break;
        unsigned char status = *p;
        if (!(status & 0x80)) break; /* error */
        p++;
        unsigned char type = status & 0xF0;
        unsigned char ch   = status & 0x0F;

        if (status == 0xFF) { /* meta */
            unsigned char mtype = *p++;
            unsigned long mlen; const unsigned char *pp=p;
            mlen = _read_vlq(&pp, end); p=pp;
            if (out_pos + 2 + mlen + 4 >= out_max) goto done;
            out[out_pos++] = 0xFF;
            out[out_pos++] = mtype;
            { unsigned char tmp[8]; int vl=_write_vlq(tmp,mlen);
              memcpy(out+out_pos,tmp,vl); out_pos+=vl; }
            memcpy(out+out_pos,p,(unsigned)mlen); out_pos+=mlen; p+=mlen;
            if (mtype == 0x2F) break;
        } else if (type == 0x90 && p+1 < end) { /* NoteOn */
            unsigned char note=p[0], vel=p[1]; p+=2;
            unsigned long dur; const unsigned char *pp=p;
            dur = _read_vlq(&pp, end); p=pp;
            out[out_pos++] = status;
            out[out_pos++] = note;
            out[out_pos++] = vel;
            /* Registrar NoteOff pendiente */
            if (n_pending < MAX_PENDING) {
                pending[n_pending].off_tick = cur_tick + dur;
                pending[n_pending].ch   = ch;
                pending[n_pending].note = note;
                n_pending++;
            }
        } else if (type==0x80 && p+1<end) {
            out[out_pos++]=status; out[out_pos++]=p[0]; out[out_pos++]=p[1]; p+=2;
        } else if (type==0xC0 && p<end) {
            out[out_pos++]=status; out[out_pos++]=*p++;
        } else if ((type==0xB0||type==0xE0||type==0xA0) && p+1<end) {
            out[out_pos++]=status; out[out_pos++]=p[0]; out[out_pos++]=p[1]; p+=2;
        } else if (type==0xD0 && p<end) {
            out[out_pos++]=status; out[out_pos++]=*p++;
        } else { p++; }
    }

done:
    /* End of track */
    if (out_pos + 4 < out_max) {
        out[out_pos++]=0x00; out[out_pos++]=0xFF;
        out[out_pos++]=0x2F; out[out_pos++]=0x00;
    }

    /* Escribir tamaño del track */
    { unsigned long tsz = out_pos - trk_start;
      out[trk_size_pos+0]=(unsigned char)(tsz>>24);
      out[trk_size_pos+1]=(unsigned char)(tsz>>16);
      out[trk_size_pos+2]=(unsigned char)(tsz>>8);
      out[trk_size_pos+3]=(unsigned char)(tsz); }

    g_mid_size = out_pos;
    return (int)out_pos;
}

int midi_load_xmi(const unsigned char *xmi, unsigned long size) {
    int r = _xmi_to_midi(xmi, size);
    if (r < 0) return -1;
    /* Ahora g_mid_buf tiene el MIDI convertido, parsear normalmente */
    return midi_load(g_mid_buf, g_mid_size);
}
