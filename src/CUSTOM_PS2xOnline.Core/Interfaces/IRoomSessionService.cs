namespace CUSTOM_PS2xOnline.Core.Interfaces;

public interface IRoomSessionService
{
    string CreateRoom();
    bool TryJoin(string roomCode, out string normalizedRoomCode);
}
