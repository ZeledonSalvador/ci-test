using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace FrontendQuickpass.Models
{
    public class ActiveBlacklistDto
    {
        public int Id { get; set; }
        public DriverDto? Driver { get; set; }
        public DateTime? ReportDatetime { get; set; }
        public string? EventType { get; set; }
        public string? FaultType { get; set; }
        public string? EventLocation { get; set; }
        public string? Description { get; set; }
        public List<string>? EvidenceUrls { get; set; }
        public int StatusBlacklist { get; set; }
        public DateTime? CreatedAt { get; set; }
        public ShipmentDto? Shipment { get; set; }
        public PenaltyAppliedDto? PenaltyApplied { get; set; }
        public List<BlacklistStatusHistory>? StatusHistory { get; set; }
        
        // Propiedades procesadas por el controlador
        public List<string>? ProcessedUrls { get; set; }
        public string? DriverPhotoUrl { get; set; }
        public List<string>? EvidenceUrlsProcessed { get; set; }
    }

    public class PenaltyAppliedDto
    {
        public string? PenaltyType { get; set; }
        public DateTime? PenaltyStartDate { get; set; }
        public DateTime? PenaltyEndDate { get; set; }
        public int? CalculatedDays { get; set; }
        public string? Observation { get; set; }
        public bool IsPermanent { get; set; }
        public bool IsActive { get; set; }
    }

    public class UpdatePenaltyRequest
    {
        [Required]
        public string PenaltyType { get; set; } = string.Empty;

        [Required]
        public DateTime PenaltyStartDate { get; set; }

        public DateTime? PenaltyEndDate { get; set; }

        public string? Observation { get; set; }

        public string ModifiedBy { get; set; } = string.Empty;
    }
}