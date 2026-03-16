# Use the official AWS Lambda Python 3.12 base image
FROM public.ecr.aws/lambda/python:3.12

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy handler and grader modules
COPY handler.py grader.py ./

# Lambda handler entrypoint
CMD ["handler.handler"]
