namespace FrontendQuickpass.Models
{
    public class AutorizacionIngresoModel
    {
        public List<Post> TruckTypeP { get; set; } = new();
        public List<Post> TruckTypeV { get; set; } = new();
        public List<Post> TruckTypeR { get; set; } = new();

        public Dictionary<string, int> IngenioCounts { get; set; } = new();
        public List<PostAutorizacion> UnidadesPlanas { get; set; } = new();
        public List<PostAutorizacion> UnidadesVolteo { get; set; } = new();
        public List<PostAutorizacion> UnidadesPipa { get; set; } = new();

        public int CountPlanas { get; set; }
        public int CountVolteo { get; set; }
        public int CountPipa { get; set; }

        public int ColaV { get; set; } // queueData.data.V
        public int ColaR { get; set; } // queueData.data.R
        public int ColaP { get; set; } // queueData.data.P

        public int IngenioQuantity1 { get; set; } // LA CABAÑA
        public int IngenioQuantity2 { get; set; } // SALVADOREÑA
        public int IngenioQuantity3 { get; set; } // CHAPARRASTIQUE
        public int IngenioQuantity4 { get; set; } // JIBOA
        public int IngenioQuantity5 { get; set; } // MAGDALENA
        public int IngenioQuantity6 { get; set; } // EL ANGEL
    }

    public class Status
    {
        public int id { get; set; }
        public string status { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public string date { get; set; } = string.Empty;
        public string time { get; set; } = string.Empty;
    }

    public class ShipmentAttachment
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
