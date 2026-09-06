from fastapi import APIRouter

router = APIRouter(prefix="/api")


@router.get("/comments")
async def get_comments():
    return {"comments": []}


@router.post("/comments")
async def create_comment(comment: dict):
    return {"id": 1, **comment}


@router.get("/comments/{comment_id}")
async def get_comment(comment_id: int):
    return {"id": comment_id}


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: int):
    return {"deleted": comment_id}