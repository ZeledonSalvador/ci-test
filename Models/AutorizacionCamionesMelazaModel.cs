namespace FrontendQuickpass.Models
{
    public class AutorizacionCamionesMelazaViewModel
    {
        public List<PostAutorizacionMelaza> UnidadesPipa { get; set; } = new();
        public List<PostAutorizacionMelaza> UnidadesInconsistencias { get; set; } = new();
        public int CountPipa { get; set; }
        public Dictionary<string, int> IngenioCounts { get; set; } = new();
    }

    public class PostAutorizacionMelaza
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
        public DriverAutorizacionMelaza driver { get; set; } = new();
        public VehicleAutorizacionMelaza vehicle { get; set; } = new();
        public IngenioAutorizacionMelaza ingenio { get; set; } = new();
        public List<StatusesAutorizacionMelaza> statuses { get; set; } = new();
        public List<ShipmentAttachmentAutorizacionMelaza> shipmentAttachments { get; set; } = new();
    }

    public class DriverAutorizacionMelaza
    {
        public int id { get; set; }
        public string license { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class VehicleAutorizacionMelaza
    {
        public int id { get; set; }
        public string plate { get; set; } = string.Empty;
        public string trailerPlate { get; set; } = string.Empty;
        public string truckType { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class IngenioAutorizacionMelaza
    {
        public int id { get; set; }
        public string ingenioCode { get; set; } = string.Empty;
        public string ingenioNavCode { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public UserAutorizacionMelaza user { get; set; } = new();
    }

    public class UserAutorizacionMelaza
    {
        public int id { get; set; }
        public string username { get; set; } = string.Empty;
        public string password { get; set; } = string.Empty;
        public string role { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class StatusesAutorizacionMelaza
    {
        public int id { get; set; }
        public string status { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public List<object> observation { get; set; } = new();
        public string date { get; set; } = string.Empty;
        public string time { get; set; } = string.Empty;
    }

    public class ShipmentAttachmentAutorizacionMelaza
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