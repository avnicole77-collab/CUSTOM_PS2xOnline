namespace CUSTOM_PS2xOnline.Network.Services;

public sealed class NetworkQualityRatingService
{
    public string Rate(decimal pingMs, decimal jitterMs, decimal packetLossPercent, decimal uploadMbps)
    {
        if (pingMs <= 40 && jitterMs <= 10 && packetLossPercent <= 0.5m && uploadMbps >= 10)
        {
            return "Excellent";
        }

        if (pingMs <= 80 && jitterMs <= 20 && packetLossPercent <= 1.5m && uploadMbps >= 5)
        {
            return "Good";
        }

        if (pingMs <= 120 && jitterMs <= 35 && packetLossPercent <= 3m && uploadMbps >= 2)
        {
            return "Fair";
        }

        return "Poor";
    }
}
