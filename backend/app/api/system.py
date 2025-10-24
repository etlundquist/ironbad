from fastapi import APIRouter, Response

router = APIRouter()

@router.get("/", tags=["index"])
def root():
    response = Response(content="Hello World!", status_code=200)
    return response


@router.get("/health", tags=["health"])
async def health_check():
    response = Response(content="OK", status_code=200)
    return response
