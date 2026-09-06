from fastapi import FastAPI

app = FastAPI()


@app.get("/api/users")
async def get_users():
    return {"users": []}


@app.post("/api/users")
async def create_user(user: dict):
    return {"id": 1, **user}


@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    return {"id": user_id}


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int):
    return {"deleted": user_id}


@app.get("/api/posts")
async def get_posts():
    return {"posts": []}


@app.post("/api/posts")
async def create_post(post: dict):
    return {"id": 1, **post}


@app.get("/api/posts/{post_id}")
async def get_post(post_id: int):
    return {"id": post_id}