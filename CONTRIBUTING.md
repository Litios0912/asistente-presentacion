# Contributing

Gracias por tu interes en contribuir a este proyecto.

## Reportar bugs

1. Verifica que el bug no haya sido reportado antes en Issues
2. Abre un Issue describiendo:
   - Que esperabas que pasara
   - Que paso realmente
   - Pasos para reproducirlo
   - Entorno (SO, version de Python, navegador)

## Sugerir mejoras

Abre un Issue con la etiqueta "enhancement" describiendo la mejora propuesta.

## Enviar PRs

1. Fork el repositorio
2. Crea una rama: `git checkout -b mi-cambio`
3. Haz tus cambios
4. Asegurate de que los tests pasen: `pytest`
5. Commit con mensaje claro: `git commit -m "Descripcion del cambio"`
6. Push: `git push origin mi-cambio`
7. Abre un Pull Request describiendo los cambios

## Estilo de codigo

- Sigue el estilo existente en el proyecto
- Usa nombres descriptivos en variables y funciones
- Escribe docstrings en funciones principales
- Sin comentarios innecesarios

## Tests

Ejecuta los tests antes de enviar un PR:

```bash
pip install -r requirements-dev.txt
pytest
```
