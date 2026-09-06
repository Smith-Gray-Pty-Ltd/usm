var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/api/users", () => new { users = new List<string>() });
app.MapPost("/api/users", () => Results.Created("/api/users/1", new { id = 1 }));
app.MapGet("/api/users/{id}", (int id) => new { id = id });
app.MapDelete("/api/users/{id}", (int id) => new { deleted = id });
app.MapPut("/api/users/{id}", (int id) => new { id = id, updated = true });

app.Run();