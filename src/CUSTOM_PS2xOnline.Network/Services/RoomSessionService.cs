using System.Text.RegularExpressions;
using CUSTOM_PS2xOnline.Core.Interfaces;

namespace CUSTOM_PS2xOnline.Network.Services;

public sealed partial class RoomSessionService : IRoomSessionService
{
    public string CreateRoom() => RoomCodeGenerator.Generate();

    public bool TryJoin(string roomCode, out string normalizedRoomCode)
    {
        normalizedRoomCode = (roomCode ?? string.Empty).Trim().ToUpperInvariant();
        return RoomCodePattern().IsMatch(normalizedRoomCode);
    }

    [GeneratedRegex("^[A-HJ-NP-Z2-9]{6,8}$", RegexOptions.CultureInvariant)]
    private static partial Regex RoomCodePattern();
}
