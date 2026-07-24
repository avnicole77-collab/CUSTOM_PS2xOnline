using System.Net.NetworkInformation;
using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.Infrastructure.Services;

public sealed class NetworkStatusService : INetworkStatusService
{
    public async Task<NetworkStatus> CheckAsync(CancellationToken cancellationToken = default)
    {
        if (!NetworkInterface.GetIsNetworkAvailable())
        {
            return new NetworkStatus(false, null);
        }

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var ping = new Ping();
            var reply = await ping.SendPingAsync("1.1.1.1", 2_000);
            return reply.Status == IPStatus.Success
                ? new NetworkStatus(true, reply.RoundtripTime)
                : new NetworkStatus(true, null);
        }
        catch (PingException)
        {
            return new NetworkStatus(true, null);
        }
    }
}
