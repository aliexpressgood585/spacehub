FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=UTC
RUN useradd -m -u 1000 bot
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY daybot ./daybot
COPY scripts ./scripts
COPY tests ./tests
COPY config.yaml ./config.yaml
RUN mkdir -p state logs data reports && chown -R bot:bot /app
USER bot
CMD ["python", "-m", "daybot.main", "--config", "config.yaml"]
