using Microsoft.AspNetCore.Mvc;

namespace csharp_aspnet.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll() => Ok(new { products = new List<string>() });

    [HttpGet("{id}")]
    public IActionResult GetById(int id) => Ok(new { id = id });

    [HttpPost]
    public IActionResult Create() => CreatedAtAction(nameof(GetById), new { id = 1 }, null);

    [HttpDelete("{id}")]
    public IActionResult Delete(int id) => Ok(new { deleted = id });
}