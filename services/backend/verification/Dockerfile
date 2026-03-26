FROM python:3.12-slim

WORKDIR /app

COPY lambda_function.py .
COPY tests/ tests/

RUN pip install pytest pytest-cov boto3

CMD ["pytest", "tests/", "-v", "--cov=lambda_function", "--cov-report=term-missing"]