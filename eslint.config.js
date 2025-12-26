// ESLint Configuration (Flat Config - ESLint 9+)
// Configuración permisiva para código JavaScript legacy
export default [
  {
    files: ["wwwroot/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        // Browser globals - window APIs
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        alert: "readonly",
        confirm: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        location: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        performance: "readonly",
        screen: "readonly",
        // Browser APIs - Constructors
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        Node: "readonly",
        Image: "readonly",
        // Libraries
        Chart: "readonly",
        $: "readonly",  // jQuery
        jQuery: "readonly",  // jQuery
        Swal: "readonly",  // SweetAlert2
        bootstrap: "readonly",  // Bootstrap
        Dropzone: "readonly",  // Dropzone.js
        // Variables globales de tu app
        PERMISSION: "readonly",  // Tu objeto de permisos
        Sys: "readonly"  // ASP.NET Ajax (si lo usas)
      }
    },
    rules: {
      // Errores críticos (solo cosas realmente problemáticas)
      "no-undef": "error",  // Variables no definidas
      "no-unused-vars": "off",  // Desactivado porque genera mucho ruido

      // Warnings suaves
      "no-console": "off",  // Permitir console.log
      "semi": "off",  // No forzar punto y coma
      "quotes": "off",  // Permitir comillas simples o dobles

      // Detectar problemas reales
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-unreachable": "warn"
    }
  }
];
