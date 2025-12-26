using System.ComponentModel.DataAnnotations;

namespace FrontendQuickpass.Models.Db
{
    public class TimerState
    {
        [Key]
        [Required]
        [StringLength(100)]
        public string TimerId { get; set; } = string.Empty;

        [StringLength(50)]
        public string? CodeGen { get; set; }

        public int? ShipmentId { get; set; }

        [Required]
        [StringLength(20)]
        public string TipoTimer { get; set; } = string.Empty;

        [StringLength(20)]
        public string? TipoUnidad { get; set; }

        [Required]
        public DateTimeOffset StartedAt { get; set; }

        [Required]
        public DateTimeOffset CreatedAt { get; set; }
    }
}