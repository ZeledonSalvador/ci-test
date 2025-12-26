namespace FrontendQuickpass.Models
{
    public class AutorizacionPortonModel
    {
        public int? IdNavRecord { get; set; }
        public string? CodeGen { get; set; }
        public DateTime? DateTimeCurrentStatus { get; set; }
        public DateTime? DateTimePrecheckeo { get; set; }
        public int CurrentStatus { get; set; }

        public DriverModel? Driver { get; set; }
        public VehicleModel? Vehicle { get; set; }
        public IngenioModel? Ingenio { get; set; }
    }

    public class DriverModel
    {
        public string? Name { get; set; }
        public string? License { get; set; }
    }

    public class VehicleModel
    {
        public string? Plate { get; set; }
        public string? TrailerPlate { get; set; }
        public string? TruckType { get; set; }
    }

    public class IngenioModel
    {
        public string? Name { get; set; }
    }
}
