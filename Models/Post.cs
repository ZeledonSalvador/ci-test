namespace FrontendQuickpass.Models
{
    public class Post
    {
        public string nameProduct { get; set; } = string.Empty;
        public string truckType { get; set; } = string.Empty;
        public int id { get; set; }
        public string codeGen { get; set; } = string.Empty;
        public string product { get; set; } = string.Empty;
        public string operationType { get; set; } = string.Empty;
        public string loadType { get; set; } = string.Empty;
        public string transporter { get; set; } = string.Empty;
        public double productQuantity { get; set; }
        public double productQuantityKg { get; set; }
        public int? magneticCard { get; set; }
        public int? buzzer { get; set; }
        public string unitMeasure { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public int currentStatus { get; set; }
        public Driver driver { get; set; } = new();
        public Vehicle vehicle { get; set; } = new();
        public List<shipmentSeals> shipmentSeals { get; set; } = new();
        public Statuses[] statuses { get; set; } = Array.Empty<Statuses>();
        public Ingenio ingenio { get; set; } = new();
        public DateTime? dateTimeCurrentStatus { get; set; }
        public DateTime? dateTimePrecheckeo { get; set; }
    }

    public class Driver
    {
        public int id { get; set; }
        public string license { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class Vehicle
    {
        public int id { get; set; }
        public string plate { get; set; } = string.Empty;
        public string trailerPlate { get; set; } = string.Empty;
        public string truckType { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    public class Statuses
    {
        public int id { get; set; }
        public string status { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public string date { get; set; } = string.Empty;
        public string time { get; set; } = string.Empty;
    }

    public class Ingenio
    {
        public int id { get; set; }
        public string ingenioCode { get; set; } = string.Empty;
        public string ingenioNavCode { get; set; }
        public string name { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
        public User user { get; set; } = new();
    }

    public class User
    {
        public int id { get; set; }
        public string username { get; set; } = string.Empty;
        public string password { get; set; } = string.Empty;
        public string role { get; set; } = string.Empty;
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }
    public class shipmentSeals
    {
        public int id { get; set; }
        public string sealCode { get; set; }
    }
}