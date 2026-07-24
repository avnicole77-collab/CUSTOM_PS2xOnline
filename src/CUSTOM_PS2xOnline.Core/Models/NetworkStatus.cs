namespace CUSTOM_PS2xOnline.Core.Models;

public sealed record NetworkStatus(bool IsAvailable, long? LatencyMilliseconds)
{
    public string DisplayText => !IsAvailable
        ? "Network: Offline"
        : LatencyMilliseconds is null
            ? "Network: Online"
            : $"Network: {LatencyMilliseconds} ms";
}
