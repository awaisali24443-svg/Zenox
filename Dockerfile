FROM python:3.10-slim

# Create a non-root user as required by Hugging Face Spaces
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Install dependencies into the user's home directory
COPY --chown=user ./requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy application files
COPY --chown=user . /app

# Default port for Hugging Face Spaces is 7860
EXPOSE 7860

# Run FastAPI server via Uvicorn explicitly on 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
