using System.ComponentModel.DataAnnotations;
using FrontendQuickpass.Models.Db;

namespace FrontendQuickpass.Models
{
    public class TimerStateResponse
    {
        public string TimerId { get; set; } = string.Empty;
        public string? CodeGen { get; set; }
        public int? ShipmentId { get; set; }
        public string TipoTimer { get; set; } = string.Empty;
        public string? TipoUnidad { get; set; }

        public string StartedAtLocal { get; set; } = string.Empty;

        public string StartedAtUtc { get; set; } = string.Empty;

        public long StartedAtMilliseconds { get; set; }

        public bool IsRunning { get; set; } = true;
    }

    public class StartTimerRequest
    {
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
    }

    public class StopTimerRequest
    {
        [Required]
        [StringLength(100)]
        public string TimerId { get; set; } = string.Empty;
    }

    public class TimerOperationResponse
    {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public object? Data { get; set; }
    }

    public class TimerStatsResponse
    {
        public int TotalActiveTimers { get; set; }
        public int AzucarTimers { get; set; }
        public int MelazaTimers { get; set; }
        public Dictionary<string, int> TimersByType { get; set; } = new();

        // Guardar con offset para manejar correctamente la zona horaria
        public DateTimeOffset? OldestTimerStarted { get; set; }
    }
}