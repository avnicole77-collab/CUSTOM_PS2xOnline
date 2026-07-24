using System.Security.Cryptography;
using BCrypt.Net;

namespace CUSTOM_PS2xOnline.Infrastructure.Services;

public sealed class PasswordHashService
{
    public string HashPassword(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password, 12);
    }

    public bool VerifyPassword(string password, string hash)
    {
        return BCrypt.Net.BCrypt.Verify(password, hash);
    }
}
