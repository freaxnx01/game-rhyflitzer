# #168: the region editor build service. Build from the repo root: docker build -f service/Dockerfile .
FROM node:20-bookworm-slim AS node

FROM python:3.12-slim-bookworm
# Node 20 runs prototype/route.js for the automatic race (#179); osmium-tool cuts the Swiss extract (#166).
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
 && apt-get install -y --no-install-recommends osmium-tool \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pipeline/requirements.txt pipeline/requirements.txt
COPY service/requirements.txt service/requirements.txt
RUN pip install --no-cache-dir -r pipeline/requirements.txt -r service/requirements.txt
COPY pipeline/ pipeline/
COPY prototype/ prototype/
COPY service/rhyflitzer_api/ service/rhyflitzer_api/
ENV PYTHONPATH=/app/pipeline:/app/service PYTHONUNBUFFERED=1 DATA_DIR=/data
RUN useradd --system --uid 10001 app && mkdir /data && chown app /data
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"
CMD ["uvicorn", "rhyflitzer_api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
