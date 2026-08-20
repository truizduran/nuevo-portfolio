# Tomás Ruiz Durán — Portfolio

Sitio personal de una sola página, usado como portfolio para mostrar mis proyectos como Front-end Developer.

🔗 **Demo en vivo:** https://tomasruizduran.netlify.app/

## Sobre el proyecto

Portfolio personal construido desde cero, sin frameworks ni dependencias. Pensado para ir sumando proyectos nuevos fácilmente a medida que los voy terminando.

## Secciones

- **Hero** — presentación dentro de una ventana de navegador, con una escena pixel art animada que se fragmenta en 8 piezas al hacer scroll
- **Sobre mí** — presentación y bloque de habilidades: HTML, CSS, JavaScript, Git, Bootstrap, Sass y Tailwind CSS
- **Proyectos** — fichas con contexto (problema → proceso → solución → resultado), tecnologías usadas y un link a la demo o al repositorio:
  1. Web de fotografía para cliente externo
  2. Comparador de precios de videojuegos (extensión de Chrome)
  3. Fútbol en vivo — Liga Profesional Argentina (extensión de Chrome)
- **Contacto** — formulario, email y redes (GitHub, LinkedIn)

## Bilingüe

El sitio está en español e inglés. Detecta el idioma del navegador al entrar: si es español lo muestra en español, y cualquier otro idioma lo muestra en inglés. El botón de la barra del hero permite cambiarlo a mano, y esa elección queda guardada para las próximas visitas.

## Tecnologías

- HTML5
- CSS3 (sin frameworks — estilos propios)
- JavaScript vainilla

## Estructura del proyecto

```
├── index.html
├── hero.css
├── hero.js
├── assets/
├── _headers
├── .gitignore
└── README.md
```

## Cómo correrlo localmente

1. Cloná el repositorio:
   ```bash
   git clone https://github.com/truizduran/nuevo-portfolio.git
   ```
2. Abrí `index.html` en tu navegador. No necesita instalación ni servidor.

> **Nota sobre el formulario:** el envío usa Netlify Forms, que solo funciona en el sitio publicado en Netlify. Abriendo el `index.html` en local el envío falla y muestra un aviso con el email de contacto. Es el comportamiento esperado, no un error.

## Cómo agregar un proyecto nuevo

Las tarjetas se generan solas a partir del array `PROJECTS_DATA`, dentro de `index.html`. Agregá un objeto más con esta forma:

```js
{
  number: "04",                        // se muestra grande en la tarjeta
  label: "Personal",                   // "Personal" o "Cliente"
  name: "Nombre del proyecto",
  badge: "Live Project",               // "Live Project" o "GitHub Repo"
  url: "https://...",                  // un solo link: demo o repo
  colorClass: "ph-verde",              // ph-verde | ph-violeta | ph-dorado
  images: [
    "assets/foto-principal.png",       // ocupa el recuadro grande de la derecha
    "assets/foto-secundaria.png"       // ocupa el recuadro de arriba a la izquierda
  ],
  description: "La frase de contexto que abre el panel de texto.",
  details: [
    { label: "Proceso",     text: "..." },
    { label: "Solución",    text: "..." },
    { label: "Resultado",   text: "..." },
    { label: "Tecnologías", text: "..." }
  ],
  en: {                                // traducción al inglés
    label: "Personal",
    description: "...",
    details: [
      { label: "Process",      text: "..." },
      { label: "Solution",     text: "..." },
      { label: "Result",       text: "..." },
      { label: "Technologies", text: "..." }
    ]
  }
}
```

Detalles a tener en cuenta:

- **`url` es un solo link.** La cápsula de la tarjeta lleva ahí. Si el proyecto está publicado, apuntá a la demo y usá el badge `Live Project`; si todavía no, apuntá al repositorio y usá `GitHub Repo`.
- **Las tecnologías van dentro de `details`**, como una fila más. No hay un campo aparte.
- **`colorClass` es el degradado de reserva** que se ve si falta alguna imagen. Con las dos fotos cargadas no aparece.
- **El tercer recuadro (abajo a la izquierda) no es una foto**: ahí va el texto de `description` + `details`.
- **`en` es obligatorio** si querés que el proyecto se traduzca. Sin ese bloque, la tarjeta queda en español aunque el visitante tenga el navegador en inglés.
- **`mainFit: "contain"`** es opcional. Agregalo solo si la imagen principal tiene lo importante fuera del centro y el recorte automático se lo comería.

## Despliegue

GitHub → Netlify. Cada push a `main` dispara un despliegue automático.

## Autor

Tomás Ruiz Durán — [GitHub](https://github.com/truizduran) · [LinkedIn](https://www.linkedin.com/in/tomasruizduran)
