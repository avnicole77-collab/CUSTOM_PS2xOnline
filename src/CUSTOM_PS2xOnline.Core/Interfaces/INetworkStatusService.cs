using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.Core.Interfaces;

public interface INetworkStatusService
{
    Task<NetworkStatus> CheckAsync(CancellationToken cancellationToken = default);
}
