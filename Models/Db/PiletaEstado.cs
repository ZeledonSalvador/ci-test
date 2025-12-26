using System.ComponentModel.DataAnnotations;

namespace FrontendQuickpass.Models.Db
{
    public class PiletaEstado
    {
        [Key]
        public int PiletaNumero { get; set; } // 1, 2, 3, 4, 5

        public int? ShipmentId { get; set; } // NULL = pileta libre

        [MaxLength(100)]
        public string? CodeGen { get; set; } // NULL = pileta libre

        public DateTime? FechaAsignacion { get; set; } // NULL = pileta libre

        public string? DatosShipmentJson { get; set; } // JSON del shipment completo

        public DateTime UltimaActualizacion { get; set; } = DateTime.UtcNow;
    }
}