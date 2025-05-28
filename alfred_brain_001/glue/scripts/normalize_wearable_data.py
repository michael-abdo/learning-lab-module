"""
AWS Glue ETL script to normalize wearable data from MongoDB

This script performs the following normalizations:
1. Converts all timestamps to UTC
2. Normalizes inconsistent units (e.g., heart rate in BPM)
3. Processes raw data into a consistent format
4. Saves normalized data to S3
"""

import sys
import json
import pytz
import datetime
from dateutil import parser
from pyspark.context import SparkContext
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, udf, when, lit, explode, expr
from pyspark.sql.types import StringType, DoubleType, TimestampType, StructType, StructField, ArrayType, MapType
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.dynamicframe import DynamicFrame

# Initialize Glue context
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)

# Get job parameters
args = getResolvedOptions(sys.argv, 
                          ['JOB_NAME', 
                           'database_name', 
                           'wearable_data_table', 
                           'output_bucket', 
                           'output_prefix'])

# Parameters
database_name = args['database_name']
wearable_data_table = args['wearable_data_table']
output_bucket = args['output_bucket']
output_prefix = args['output_prefix']
s3_output_path = f"s3://{output_bucket}/{output_prefix}"

# Log job parameters
print(f"Job Parameters:")
print(f"  database_name: {database_name}")
print(f"  wearable_data_table: {wearable_data_table}")
print(f"  output_bucket: {output_bucket}")
print(f"  output_prefix: {output_prefix}")
print(f"  s3_output_path: {s3_output_path}")

# Read data from Glue catalog (MongoDB)
wearable_data = glueContext.create_dynamic_frame.from_catalog(
    database=database_name,
    table_name=wearable_data_table
)

# Convert to DataFrame for easier processing
wearable_df = wearable_data.toDF()

# Show sample data and schema
print("Sample data and schema:")
wearable_df.printSchema()
wearable_df.show(5, truncate=False)

# Function to convert string timestamp to UTC
def convert_to_utc(timestamp_str):
    if timestamp_str is None:
        return None
    try:
        # Parse the timestamp
        dt = parser.parse(timestamp_str)
        
        # If timezone is not specified, assume local and convert to UTC
        if dt.tzinfo is None:
            local_tz = pytz.timezone('America/New_York')  # Default timezone
            dt = local_tz.localize(dt)
        
        # Convert to UTC
        utc_dt = dt.astimezone(pytz.UTC)
        return utc_dt
    except Exception as e:
        print(f"Error converting timestamp {timestamp_str}: {e}")
        return None

# Function to normalize heart rate (ensure it's in BPM)
def normalize_heart_rate(heart_rate_data):
    if heart_rate_data is None:
        return None
    
    try:
        # Convert string to dict if needed
        if isinstance(heart_rate_data, str):
            heart_rate_data = json.loads(heart_rate_data)
        
        # Common heart rate normalization scenarios:
        
        # 1. Convert from normalized values (0-1) to BPM
        if 'normalized' in heart_rate_data and heart_rate_data.get('unit') == 'normalized':
            if heart_rate_data.get('avg_normalized', 0) > 0 and heart_rate_data.get('avg_normalized', 0) < 1:
                # Typical resting HR is 60-100 BPM, max HR ~220 BPM
                min_hr = 40
                max_hr = 220
                range_hr = max_hr - min_hr
                heart_rate_data['avg_bpm'] = min_hr + (heart_rate_data['avg_normalized'] * range_hr)
                heart_rate_data['unit'] = 'bpm'
        
        # 2. Ensure 'bpm' is the unit (sometimes it's BPM, bpm, beats_per_minute, etc.)
        if 'unit' in heart_rate_data:
            if heart_rate_data['unit'].lower() in ['bpm', 'beats_per_minute', 'beats per minute']:
                heart_rate_data['unit'] = 'bpm'
        else:
            heart_rate_data['unit'] = 'bpm'
        
        # 3. If avg_hr exists but avg_bpm doesn't, copy the value
        if 'avg_hr' in heart_rate_data and 'avg_bpm' not in heart_rate_data:
            heart_rate_data['avg_bpm'] = heart_rate_data['avg_hr']
        
        # 4. Default values if missing
        if 'avg_bpm' not in heart_rate_data and 'data_points' in heart_rate_data:
            data_points = heart_rate_data.get('data_points', [])
            if data_points and len(data_points) > 0:
                bpm_values = [dp.get('value', 0) for dp in data_points if 'value' in dp]
                if bpm_values:
                    heart_rate_data['avg_bpm'] = sum(bpm_values) / len(bpm_values)
        
        return heart_rate_data
    except Exception as e:
        print(f"Error normalizing heart rate: {e}")
        return heart_rate_data

# Function to normalize activity data
def normalize_activity(activity_data):
    if activity_data is None:
        return None
    
    try:
        # Convert string to dict if needed
        if isinstance(activity_data, str):
            activity_data = json.loads(activity_data)
        
        # 1. Normalize distance to meters
        if 'distance' in activity_data:
            distance = activity_data['distance']
            distance_unit = activity_data.get('distance_unit', 'meters').lower()
            
            # Convert to meters
            if distance_unit == 'km' or distance_unit == 'kilometers':
                activity_data['distance_meters'] = distance * 1000
            elif distance_unit == 'mi' or distance_unit == 'miles':
                activity_data['distance_meters'] = distance * 1609.34
            elif distance_unit == 'ft' or distance_unit == 'feet':
                activity_data['distance_meters'] = distance * 0.3048
            else:  # Assume meters
                activity_data['distance_meters'] = distance
            
            activity_data['distance_unit'] = 'meters'
        
        # 2. Normalize calories
        if 'calories' in activity_data and 'total_calories' not in activity_data:
            activity_data['total_calories'] = activity_data['calories']
        elif 'active_calories' in activity_data and 'total_calories' not in activity_data:
            # Estimate total from active (assuming BMR is about 1800 calories per day)
            if 'duration_ms' in activity_data:
                hours = activity_data['duration_ms'] / (1000 * 60 * 60)
                bmr_calories = (1800 / 24) * hours  # Pro-rated BMR calories
                activity_data['total_calories'] = activity_data['active_calories'] + bmr_calories
            else:
                activity_data['total_calories'] = activity_data['active_calories']
        
        # 3. Normalize steps (ensure it's an integer)
        if 'steps' in activity_data and activity_data['steps'] is not None:
            activity_data['steps'] = int(float(activity_data['steps']))
        
        return activity_data
    except Exception as e:
        print(f"Error normalizing activity data: {e}")
        return activity_data

# Function to normalize sleep data
def normalize_sleep(sleep_data):
    if sleep_data is None:
        return None
    
    try:
        # Convert string to dict if needed
        if isinstance(sleep_data, str):
            sleep_data = json.loads(sleep_data)
        
        # 1. Normalize sleep duration to milliseconds
        if 'sleep_duration' in sleep_data and 'sleep_duration_ms' not in sleep_data:
            duration = sleep_data['sleep_duration']
            duration_unit = sleep_data.get('duration_unit', 'seconds').lower()
            
            # Convert to milliseconds
            if duration_unit == 'seconds' or duration_unit == 's':
                sleep_data['sleep_duration_ms'] = duration * 1000
            elif duration_unit == 'minutes' or duration_unit == 'min':
                sleep_data['sleep_duration_ms'] = duration * 60 * 1000
            elif duration_unit == 'hours' or duration_unit == 'h':
                sleep_data['sleep_duration_ms'] = duration * 60 * 60 * 1000
            else:  # Assume milliseconds
                sleep_data['sleep_duration_ms'] = duration
            
            sleep_data['duration_unit'] = 'ms'
        
        # 2. Normalize sleep stages
        if 'stages' in sleep_data:
            stages = sleep_data['stages']
            normalized_stages = {}
            
            # Common stage mappings
            stage_mapping = {
                'light': ['light', 'light_sleep'],
                'deep': ['deep', 'deep_sleep', 'slow_wave'],
                'rem': ['rem', 'rem_sleep', 'rapid_eye_movement'],
                'awake': ['awake', 'wake', 'wakefulness']
            }
            
            # Convert stages to standard format
            for standard_stage, variations in stage_mapping.items():
                for variation in variations:
                    if variation in stages:
                        normalized_stages[standard_stage] = stages[variation]
            
            sleep_data['normalized_stages'] = normalized_stages
        
        return sleep_data
    except Exception as e:
        print(f"Error normalizing sleep data: {e}")
        return sleep_data

# Create UDFs for the normalization functions
convert_to_utc_udf = udf(convert_to_utc, TimestampType())
normalize_heart_rate_udf = udf(normalize_heart_rate, MapType(StringType(), StringType()))
normalize_activity_udf = udf(normalize_activity, MapType(StringType(), StringType()))
normalize_sleep_udf = udf(normalize_sleep, MapType(StringType(), StringType()))

# Apply normalizations
normalized_df = wearable_df \
    .withColumn("start_date_utc", convert_to_utc_udf(col("start_date"))) \
    .withColumn("end_date_utc", convert_to_utc_udf(col("end_date"))) \
    .withColumn("date_utc", convert_to_utc_udf(col("date"))) \
    .withColumn("normalized_heart_rate", normalize_heart_rate_udf(col("heart_rate"))) \
    .withColumn("normalized_activity", normalize_activity_udf(col("activity"))) \
    .withColumn("normalized_sleep", normalize_sleep_udf(col("sleep")))

# Extract BPM, distance, steps for easier querying
final_df = normalized_df \
    .withColumn("avg_heart_rate_bpm", 
                when(col("normalized_heart_rate").isNotNull(), 
                     col("normalized_heart_rate.avg_bpm")).otherwise(None)) \
    .withColumn("distance_meters", 
                when(col("normalized_activity").isNotNull(), 
                     col("normalized_activity.distance_meters")).otherwise(None)) \
    .withColumn("steps", 
                when(col("normalized_activity").isNotNull(), 
                     col("normalized_activity.steps")).otherwise(None)) \
    .withColumn("sleep_duration_ms", 
                when(col("normalized_sleep").isNotNull(), 
                     col("normalized_sleep.sleep_duration_ms")).otherwise(None))

# Show the normalized data
print("Sample normalized data:")
final_df.select("_id", "user_id", "data_type", "start_date_utc", "end_date_utc", 
                "avg_heart_rate_bpm", "distance_meters", "steps", "sleep_duration_ms").show(5)

# Partition by data_type and date
output_df = final_df.repartition("data_type", "date_utc")

# Convert back to DynamicFrame for writing
output_dyf = DynamicFrame.fromDF(output_df, glueContext, "output_dyf")

# Write to S3 in Parquet format, partitioned by data_type and date
sink = glueContext.getSink(
    connection_type="s3",
    path=s3_output_path,
    enableUpdateCatalog=True,
    updateBehavior="UPDATE_IN_DATABASE",
    partitionKeys=["data_type", "year", "month", "day"]
)

# Add partition columns
output_dyf = output_dyf \
    .withColumn("year", expr("year(date_utc)")) \
    .withColumn("month", expr("month(date_utc)")) \
    .withColumn("day", expr("day(date_utc)"))

# Set catalog info
sink.setCatalogInfo(
    catalogDatabase=database_name,
    catalogTableName=f"{wearable_data_table}_normalized"
)

# Write to S3
sink.writeFrame(output_dyf)

# Log completion
print(f"Normalized data written to {s3_output_path}")

# Commit the job
job.commit()