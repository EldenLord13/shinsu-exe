from fastapi import FastAPI

# Initialize the server application
app = FastAPI()

# Create your very first "Endpoint" (a URL route)
@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Welcome to the Anime.exe Backend API!",
        "version": "1.0"
    }

@app.get("/api/test")
async def test_api():
    return {"data": "If your frontend sees this, the server is working perfectly."}