# MCP Evolution API Supergateway

MCP Evo Supergateway is gateway application to interface with the Evolution API. 
It sets up an stdio MCP server defined in `index.js` and exposes it as a server-sent events (SSE) endpoint, making it ideal for remote connections or integration with tools like n8n.

## Getting Started
To get started, first clone this repository:
```bash
git clone https://github.com/brunonuzzi/evo-mcp.git
cd mcp-evo-supergateway
```

## Building the Docker Image
To build the Docker image for this repository, run the following command:
```bash
docker build --pull --rm -f 'Dockerfile' -t 'mcp-evo-supergateway:latest' '.'
```

## Running the Docker Container
To run the Docker container, use the following command:
```bash
docker run -it --rm -p 8000:8000 mcp-evo-supergateway:latest
```

## Environment Variables
The application requires the following environment variables to be set:
- `EVOLUTION_APIKEY=`: Your API key for the Evolution service.
- `EVOLUTION_INSTANCE=`: The instance identifier for the Evolution service.
- `EVOLUTION_API_BASE=`: The base URL for the Evolution API.

## Accessing the MCP SSE Server
Once the container is running, you can access the application at:
```
http://localhost:8000/sse
```

## Testing the Application
To test the application, run the following command:
```bash
npx @modelcontextprotocol/inspector
```
Then connect to:
```
http://localhost:8000/sse
```
