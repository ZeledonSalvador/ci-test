namespace FrontendQuickpass.Models
{
    public class TiemposAzucarViewModel
    {
        public List<PostTiemposAzucar> UnidadesPlanasCola { get; set; } = new();
        public List<PostTiemposAzucar> UnidadesVolteoCola { get; set; } = new();
        public List<PostTiemposAzucar> UnidadesPlanasProceso { get; set; } = new();
        public List<PostTiemposAzucar> UnidadesVolteoProceso { get; set; } = new();
        public int TotalRegistrosPlanas { get; set; }
        public int TotalRegistrosVolteo { get; set; }
        public int NumberInputPlano { get; set; }
        public int NumberInputVolteo { get; set; }
    }

    public class PostTiemposAzucar
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
        public string unitMeasure { get; set; } = string.Empty;
        public string requiresSweeping { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public int currentStatus { get; set; }
        public DateTime dateTimeCurrentStatus { get; set; }
        public DateTime? dateTimePrecheckeo { get; set; }
        public int? idPreTransaccionLeverans { get; set; }
        public int? idNavRecord { get; set; }
        public bool mapping { get; set; }
        public DriverTiemposAzucar driver { get; set; } = new();
        public VehicleTiemposAzucar vehicle { get; set; } = new();
        public IngenioTiemposAzucar ingenio { get; set; } = new();
        public List<StatusTiemposAzucar> statuses { get; set; } = new();
        public List<ShipmentAttachmentTiemposAzucar> shipmentAttachments { get; set; } = new();
        public List<ShipmentSealTiemposAzucar> shipmentSeals { get; set; } = new();
        public NavRecordTiemposAzucar navRecord { get; set; } = new();

        // Propiedades adicionales
        public string TimeForId2 { get; set; } = string.Empty;
        public bool IsFirst { get; set; }
    }

    public class DriverTiemposAzucar
    {
        public int id { get; set; }
        public string license { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class VehicleTiemposAzucar
    {
        public int id { get; set; }
        public string plate { get; set; } = string.Empty;
        public string trailerPlate { get; set; } = string.Empty;
        public string truckType { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class IngenioTiemposAzucar
    {
        public int id { get; set; }
        public string ingenioCode { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public UserTiemposAzucar user { get; set; } = new();
    }

    public class UserTiemposAzucar
    {
        public int id { get; set; }
        public string username { get; set; } = string.Empty;
        public string password { get; set; } = string.Empty;
        public string role { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class StatusTiemposAzucar
    {
        public int id { get; set; }
        public string status { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public string date { get; set; } = string.Empty;
        public string time { get; set; } = string.Empty;
    }

    public class ShipmentAttachmentTiemposAzucar
    {
        public int id { get; set; }
        public string fileUrl { get; set; } = string.Empty;
        public string fileName { get; set; } = string.Empty;
        public string fileType { get; set; } = string.Empty;
        public string attachmentType { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class ShipmentSealTiemposAzucar
    {
        public int id { get; set; }
        public string sealCode { get; set; } = string.Empty;
        public string sealDescription { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
    }

    public class NavRecordTiemposAzucar
    {
        public string timestamp { get; set; } = string.Empty;
        public int id { get; set; }
        public int transaccion { get; set; }
        public string ticket { get; set; } = string.Empty;
        public DateTime fechaentra { get; set; }
        public string horaentra { get; set; } = string.Empty;
        public DateTime fechasale { get; set; }
        public string horasale { get; set; } = string.Empty;
        public string tiempo { get; set; } = string.Empty;
        public int tarjetano { get; set; }
        public int bascula { get; set; }
        public int bascula2 { get; set; }
        public string actividad { get; set; } = string.Empty;
        public string descActividad { get; set; } = string.Empty;
        public string almacen { get; set; } = string.Empty;
        public string descAlmacen { get; set; } = string.Empty;
        public string producto { get; set; } = string.Empty;
        public string descProducto { get; set; } = string.Empty;
        public string categoria { get; set; } = string.Empty;
        public int pesoin { get; set; }
        public int pesoout { get; set; }
        public int pesoneto { get; set; }
        public string cliente { get; set; } = string.Empty;
        public string descCliente { get; set; } = string.Empty;
        public string vehiculo { get; set; } = string.Empty;
        public string motorista { get; set; } = string.Empty;
        public string descMotorista { get; set; } = string.Empty;
        public string transportista { get; set; } = string.Empty;
        public string descTransportista { get; set; } = string.Empty;
        public string codbuque { get; set; } = string.Empty;
        public string buque { get; set; } = string.Empty;
        public string envioingenio { get; set; } = string.Empty;
        public string envioalmapac { get; set; } = string.Empty;
        public string viajecepa { get; set; } = string.Empty;
        public string boletacepa { get; set; } = string.Empty;
        public int pesocepa { get; set; }
        public int tipocarga { get; set; }
        public string observaciones { get; set; } = string.Empty;
        public string usuario { get; set; } = string.Empty;
        public int semaforo { get; set; }
        public int semaforo2 { get; set; }
        public int semaforo3 { get; set; }
        public int semaforo4 { get; set; }
        public int estatus { get; set; }
        public int salida { get; set; }
        public int codfactor { get; set; }
        public int factor1 { get; set; }
        public float factor2 { get; set; }
        public int factor3 { get; set; }
        public double pesocliente { get; set; }
        public int equivalencia { get; set; }
        public string ticketgranel { get; set; } = string.Empty;
        public string ticketensacado { get; set; } = string.Empty;
        public string almacen2 { get; set; } = string.Empty;
        public string descAlmacen2 { get; set; } = string.Empty;
        public string ticketlimpieza { get; set; } = string.Empty;
        public string codigounidad { get; set; } = string.Empty;
        public string ordenretiro { get; set; } = string.Empty;
        public int tipocamion { get; set; }
        public int tipocamionr { get; set; }
        public int pesoreal { get; set; }
        public string usuariosale { get; set; } = string.Empty;
        public string usuariomod { get; set; } = string.Empty;
        public int registro { get; set; }
        public int dobleticket { get; set; }
        public int ticketenano { get; set; }
        public int disponible { get; set; }
        public DateTime fechabarco { get; set; }
        public DateTime fechabarco2 { get; set; }
        public int pesoinv1 { get; set; }
        public int pesoinv2 { get; set; }
        public string remision { get; set; } = string.Empty;
        public string licencia { get; set; } = string.Empty;
        public string mercancia { get; set; } = string.Empty;
        public string contenedor { get; set; } = string.Empty;
        public int bultos { get; set; }
        public string documentos { get; set; } = string.Empty;
        public DateTime fechaTemp { get; set; }
        public double temperatura { get; set; }
        public int basculaEntrada { get; set; }
        public int idZafra { get; set; }
        public int peso2 { get; set; }
        public int codbuque2 { get; set; }
        public int statusAuthorized { get; set; }
        public string puerta { get; set; } = string.Empty;
        public int status { get; set; }
        public int inventory { get; set; }
        public int quantityRelasedI { get; set; }
        public int liquidacion { get; set; }
        public string codbuque21 { get; set; } = string.Empty;
        public string codbuque3 { get; set; } = string.Empty;
        public string codbuque4 { get; set; } = string.Empty;
        public string codbuque5 { get; set; } = string.Empty;
        public int agentLogTruck { get; set; }
        public string lotNo { get; set; } = string.Empty;
        public double qtyRelasedAvailability { get; set; }
        public string marchamo1 { get; set; } = string.Empty;
        public string marchamo2 { get; set; } = string.Empty;
        public string marchamo3 { get; set; } = string.Empty;
        public string marchamo4 { get; set; } = string.Empty;
    }

    public class QueueData
    {
        public QueueDataInner data { get; set; } = new();
    }

    public class QueueDataInner
    {
        public int V { get; set; }
        public int P { get; set; }
        public int R { get; set; }
    }

    // Request Models para las llamadas AJAX del JavaScript
    public class SolicitarUnidadRequest
    {
        public string Tipo_Unidad { get; set; } = string.Empty;
        public int CurrentValue { get; set; }
    }

    public class ReducirUnidadRequest
    {
        public string Tipo_Unidad { get; set; } = string.Empty;
        public int UnidadesReducidas { get; set; }
    }

    public class SweepingLogRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public bool RequiresSweeping { get; set; }
        public string Observation { get; set; } = string.Empty;
    }

    public class TiempoAzucarRequest
    {
        public string CodigoGeneracion { get; set; } = string.Empty;
        public string Tiempo { get; set; } = string.Empty;
        public string Comentario { get; set; } = string.Empty;
        public int ShipmentId { get; set; }
        public string TruckType { get; set; } = string.Empty;
    }

    public class ChangeStatusRequestTempoAzucar
    {
        public string CodeGen { get; set; } = string.Empty;
        public int PredefinedStatusId { get; set; }
    }
}