MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024
EMBEDDING_VECTOR_DIMENSION = 1536
MAX_STANDARD_CLAUSE_RULES = 10

CHAT_ENDPOINT_DESCRIPTION = """
Send a new chat message and get the response as a stream of server-sent events (SSE).

### Example CURL
```bash
curl -N -X POST "http://localhost:8000/chat" \
    -H "Content-Type: application/json" \
    -d '{"contract_id": "123e4567-e89b-12d3-a456-426614174000", "content": "What is the termination clause?"}'
```
""".strip()