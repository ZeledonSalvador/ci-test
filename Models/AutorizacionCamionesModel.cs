namespace FrontendQuickpass.Models
{
    public class AutorizacionCamionesViewModel
    {
        public List<PostAutorizacion> UnidadesPlanas { get; set; } = new();
        public List<PostAutorizacion> UnidadesVolteo { get; set; } = new();
        public List<PostAutorizacion> UnidadesInconsistencias { get; set; } = new();
        public int CountPlanas { get; set; }
        public int CountVolteo { get; set; }
        public Dictionary<string, int> IngenioCounts { get; set; } = new();
    }

    public class PostAutorizacion
    {
        public string nameProduct { get; set; } = string.Empty;
        public int id { get; set; }
        public string codeGen { get; set; } = string.Empty;
        public string product { get; set; } = string.Empty;
        public string operationType { get; set; } = string.Empty;
        public string loadType { get; set; } = string.Empty;
        public string transporter { get; set; } = string.Empty;
        public double productQuantity { get; set; }
        public long productQuantityKg { get; set; }
        public int? magneticCard { get; set; }
        public int? buzzer { get; set; }
        public string unitMeasure { get; set; } = string.Empty;
        public string requiresSweeping { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public int currentStatus { get; set; }
        public DateTime? dateTimeCurrentStatus { get; set; }
        public DateTime? dateTimePrecheckeo { get; set; }
        public int? idPreTransaccionLeverans { get; set; }
        public bool mapping { get; set; }
        public DriverAutorizacion driver { get; set; } = new();
        public VehicleAutorizacion vehicle { get; set; } = new();
        public IngenioAutorizacion ingenio { get; set; } = new();
        public List<StatusesAutorizacion> statuses { get; set; } = new();
        public List<ShipmentAttachmentAutorizacion> shipmentAttachments { get; set; } = new();
    }

    public class DriverAutorizacion
    {
        public int id { get; set; }
        public string license { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class VehicleAutorizacion
    {
        public int id { get; set; }
        public string plate { get; set; } = string.Empty;
        public string trailerPlate { get; set; } = string.Empty;
        public string truckType { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class IngenioAutorizacion
    {
        public int id { get; set; }
        public string ingenioCode { get; set; } = string.Empty;
        public string ingenioNavCode { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public UserAutorizacion user { get; set; } = new();
    }

    public class UserAutorizacion
    {
        public int id { get; set; }
        public string username { get; set; } = string.Empty;
        public string password { get; set; } = string.Empty;
        public string role { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class StatusesAutorizacion
    {
        public int id { get; set; }
        public string status { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public List<object> observation { get; set; } = new();
        public string date { get; set; } = string.Empty;
        public string time { get; set; } = string.Empty;
    }

    public class ShipmentAttachmentAutorizacion
    {
        public int id { get; set; }
        public string fileUrl { get; set; } = string.Empty;
        public string fileName { get; set; } = string.Empty;
        public string fileType { get; set; } = string.Empty;
        public string attachmentType { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }
}