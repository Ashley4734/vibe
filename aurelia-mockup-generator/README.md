# Aurelia Mockup Generator

This project builds a Docker image for the mockup generator service.

## Runtime environment variables

The image requires the following environment variables at runtime:

- `REPLICATE_API_TOKEN` – API token for the Replicate service.
- `REPLICATE_MODEL_VERSION` – Model version identifier used by Replicate.

Provide these variables when starting the container, for example:

```bash
docker run -e REPLICATE_API_TOKEN=your_token \
           -e REPLICATE_MODEL_VERSION=your_model_version \
           -p 3000:3000 <image-name>
```

They can also be supplied using Docker secrets or your orchestration platform's
secret management features.
