FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates

# install `uv` to handle dependencies
ADD https://astral.sh/uv/install.sh /uv-installer.sh
RUN sh /uv-installer.sh && rm /uv-installer.sh
ENV PATH="/root/.local/bin/:$PATH"

# set working directory
WORKDIR /src

# install dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --locked

# copy source code
COPY app/ ./app/

# expoose port and start the application
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
