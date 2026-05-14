# Use an official Python runtime as a parent image
FROM python:3.11-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install any needed dependencies specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Make port 7080 available to the world outside the container
EXPOSE 7080

# Define environment variable
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=7080

# Run the Flask app when the container launches
CMD ["flask", "run"]
