namespace FrontendQuickpass.Models
{
    public class ValidarDatosRequest
    {
        public string CodigoGeneracion { get; set; } = string.Empty;
        public string Licencia { get; set; } = string.Empty;
        public string PlacaRemolque { get; set; } = string.Empty;
        public string PlacaCamion { get; set; } = string.Empty;
        public int Tarjeta { get; set; }
        public int Buzzer { get; set; }
    }
    
    public class AsignarTarjetaRequest
    {
        public string CodigoGeneracion { get; set; } = string.Empty;
        public int Tarjeta { get; set; }
    }
    
    public class AsignarBuzzerRequest
    {
        public string CodigoGeneracion { get; set; } = string.Empty;
        public int Buzzer { get; set; }
    }
    
    public class ChangeStatusRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public int PredefinedStatusId { get; set; }
    }
    
    public class ReporteInconsistenciaRequest
    {
        public string CodigoGeneracion { get; set; } = string.Empty;
        public string Comentario { get; set; } = string.Empty;
        public List<InconsistencyField> DatosInconsistentes { get; set; } = new();
        public string TipoReporte { get; set; } = string.Empty;
        public string NombreIngenio { get; set; } = string.Empty;
    }
    
    public class InconsistencyField
    {
        public string Campo { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Valor { get; set; } = string.Empty;
    }
}