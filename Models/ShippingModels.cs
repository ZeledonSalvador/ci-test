using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace FrontendQuickpass.Models
{
    public class ShippingStatus
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;

        [JsonPropertyName("time")]
        public string Time { get; set; } = string.Empty;
    }

    public class ShippingDriver
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("license")]
        public string License { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
    }

    public class ShippingVehicle
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("plate")]
        public string Plate { get; set; } = string.Empty;

        [JsonPropertyName("trailerPlate")]
        public string TrailerPlate { get; set; } = string.Empty;

        [JsonPropertyName("truckType")]
        public string TruckType { get; set; } = string.Empty;
    }

    public class ShippingIngenioUser
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;
    }

    public class ShippingIngenioUserWrapper
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;
    }

    public class ShippingIngenio
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("ingenioCode")]
        public string IngenioCode { get; set; } = string.Empty;

        [JsonPropertyName("ingenioNavCode")]
        public string IngenioNavCode { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("user")]
        public ShippingIngenioUserWrapper? User { get; set; }
    }

    public class ShippingSeal
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("sealCode")]
        public string SealCode { get; set; } = string.Empty;

        [JsonPropertyName("sealDescription")]
        public string? SealDescription { get; set; }
    }

    public class ShippingNavRecord
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("transaccion")]
        public int Transaccion { get; set; }

        [JsonPropertyName("pesoin")]
        public decimal PesoIn { get; set; }

        [JsonPropertyName("pesoneto")]
        public decimal PesoNeto { get; set; }

        [JsonPropertyName("descCliente")]
        public string DescCliente { get; set; } = string.Empty;

        [JsonPropertyName("descProducto")]
        public string DescProducto { get; set; } = string.Empty;

        [JsonPropertyName("envioingenio")]
        public string EnvioIngenio { get; set; } = string.Empty;
    }

    public class PesoAlmapac
    {
        [JsonPropertyName("pesoAlmapac")]
        public decimal Valor { get; set; }
    }

    public class Pesaje
    {
        [JsonPropertyName("numero")]
        public int Numero { get; set; }

        [JsonPropertyName("bruto")]
        public PesoAlmapac Bruto { get; set; } = new();

        [JsonPropertyName("tara")]
        public PesoAlmapac Tara { get; set; } = new();
    }

    public class Consolidado
    {
        [JsonPropertyName("total")]
        public decimal Total { get; set; }
    }

    public class MarchamoAlmapac
    {
        [JsonPropertyName("numero")]
        public int Numero { get; set; }

        [JsonPropertyName("posicion")]
        public int Posicion { get; set; }
    }

    public class ShippingDetailResponse
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("nameProduct")]
        public string NameProduct { get; set; } = string.Empty;

        [JsonPropertyName("truckType")]
        public string TruckType { get; set; } = string.Empty;

        [JsonPropertyName("codeGen")]
        public string CodeGen { get; set; } = string.Empty;

        [JsonPropertyName("product")]
        public string Product { get; set; } = string.Empty;

        [JsonPropertyName("operationType")]
        public string OperationType { get; set; } = string.Empty;

        [JsonPropertyName("loadType")]
        public string LoadType { get; set; } = string.Empty;

        [JsonPropertyName("transporter")]
        public string Transporter { get; set; } = string.Empty;

        [JsonPropertyName("productQuantity")]
        public decimal ProductQuantity { get; set; }

        [JsonPropertyName("productQuantityKg")]
        public decimal ProductQuantityKg { get; set; }

        [JsonPropertyName("unitMeasure")]
        public string UnitMeasure { get; set; } = string.Empty;

        [JsonPropertyName("requiresSweeping")]
        public string RequiresSweeping { get; set; } = string.Empty;

        [JsonPropertyName("activityNumber")]
        public string ActivityNumber { get; set; } = string.Empty;

        [JsonPropertyName("magneticCard")]
        public int MagneticCard { get; set; }

        [JsonPropertyName("currentStatus")]
        public int CurrentStatus { get; set; }

        [JsonPropertyName("dateTimeCurrentStatus")]
        public DateTime DateTimeCurrentStatus { get; set; }

        [JsonPropertyName("dateTimePrecheckeo")]
        public DateTime DateTimePrecheckeo { get; set; }

        [JsonPropertyName("idNavRecord")]
        public int IdNavRecord { get; set; }

        [JsonPropertyName("idPreTransaccionLeverans")]
        public int? IdPreTransaccionLeverans { get; set; }

        [JsonPropertyName("mapping")]
        public bool Mapping { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("updatedAt")]
        public DateTime UpdatedAt { get; set; }

        [JsonPropertyName("pesoBruto")]
        public decimal PesoBruto { get; set; }

        [JsonPropertyName("pesoTara")]
        public decimal PesoTara { get; set; }

        [JsonPropertyName("brix")]
        public decimal? Brix { get; set; }

        [JsonPropertyName("driver")]
        public ShippingDriver Driver { get; set; } = new();

        [JsonPropertyName("vehicle")]
        public ShippingVehicle Vehicle { get; set; } = new();

        [JsonPropertyName("statuses")]
        public List<ShippingStatus> Statuses { get; set; } = new();

        [JsonPropertyName("ingenio")]
        public ShippingIngenio Ingenio { get; set; } = new();

        [JsonPropertyName("shipmentSeals")]
        public List<ShippingSeal> ShipmentSeals { get; set; } = new();

        [JsonPropertyName("navRecord")]
        public ShippingNavRecord NavRecord { get; set; } = new();

        [JsonPropertyName("humidity")]
        public decimal? Humidity { get; set; }

        [JsonPropertyName("pesajes")]
        public List<Pesaje> Pesajes { get; set; } = new();

        [JsonPropertyName("consolidado")]
        public Consolidado? Consolidado { get; set; }

        [JsonPropertyName("marchamos")]
        public List<MarchamoAlmapac> Marchamos { get; set; } = new();
    }
}
