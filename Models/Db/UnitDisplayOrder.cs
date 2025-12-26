using System.ComponentModel.DataAnnotations;

namespace FrontendQuickpass.Models.Db
{
    public class UnitDisplayOrder
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int ShipmentId { get; set; }

        [StringLength(50)]
        public string? CodeGen { get; set; }

        [Required]
        [StringLength(20)]
        public string TipoTimer { get; set; } = string.Empty;

        // Orden de visualización (menor número = más arriba)
        [Required]
        public int DisplayOrder { get; set; }

        [Required]
        public DateTimeOffset UpdatedAt { get; set; }

        [Required]
        public DateTimeOffset CreatedAt { get; set; }

        // Estado de la unidad para referencia
        [Required]
        public int CurrentStatus { get; set; }
    }
}