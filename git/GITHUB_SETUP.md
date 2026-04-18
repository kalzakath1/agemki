# Subir AGEMKI a GitHub — paso a paso

## 1. Crear el repositorio en GitHub

1. Ve a https://github.com/new
2. Nombre: `agemki` (o el que prefieras)
3. Visibilidad: Public o Private
4. **No** marques "Add a README" ni ".gitignore" — ya los tenemos
5. Clic en **Create repository**

---

## 2. Inicializar git en el proyecto

Abre una terminal en la raíz del proyecto (`c:\DOS\scumm-editor-v32\`) y ejecuta:

```bash
git init
git add .
git commit -m "Initial commit — AGEMKI v32"
```

---

## 3. Conectar con GitHub y subir

Copia la URL que te da GitHub tras crear el repo y ejecuta:

```bash
git remote add origin https://github.com/TU_USUARIO/agemki.git
git branch -M main
git push -u origin main
```

---

## 4. Subidas posteriores (flujo normal)

```bash
git add .
git commit -m "descripción del cambio"
git push
```

---

## Notas

- `node_modules/`, `out/`, `dist/`, `build/`, `*.exe` y `*.dat` están excluidos en `.gitignore` — no se subirán.
- El archivo `game/GAME.DAT` y `game/GAME.EXE` son generados por el editor; tampoco se suben.
- Si el repositorio es público, revisa que no haya credenciales o rutas privadas en `CLAUDE.md`.
