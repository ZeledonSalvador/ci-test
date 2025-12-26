namespace FrontendQuickpass.Models
{
    public class ReporteMarchamosRequest
    {
        public string CodigoGeneracion { get; set; } = string.Empty;
        public string? Comentario { get; set; }
        public string TipoReporte { get; set; } = "SEALS";

        // Opción A: arreglo de objetos
        public List<SealItem>? Seals { get; set; }

        // Opción B: campos sueltos
        public string? Marchamo1 { get; set; }
        public string? Marchamo2 { get; set; }
        public string? Marchamo3 { get; set; }
        public string? Marchamo4 { get; set; }

        // NUEVO: Arrays completos para comparación por conjuntos en el backend
        public List<string>? AllScannedSeals { get; set; }
        public List<string>? ExpectedSeals { get; set; }
    }

    public class SealItem
    {
        public string? position { get; set; } // puede venir "marchamo1"
        public string? code { get; set; }     // alias
        public string? sealCode { get; set; } // oficial

        public int? pos { get; set; }         // alias numérico
    }
}
