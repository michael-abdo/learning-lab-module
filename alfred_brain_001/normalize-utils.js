/**
 * Normalization Utilities
 * 
 * These functions handle data normalization for wearable data
 */

// Function to convert timestamp to UTC
function convertToUtc(date) {
  if (!date) return null;
  
  // If already a Date object, simply ensure it's in UTC
  if (date instanceof Date) {
    return new Date(date.getTime());
  }
  
  // If string, parse and convert to UTC
  try {
    const parsedDate = new Date(date);
    return new Date(parsedDate.getTime());
  } catch (error) {
    console.error(`Error converting timestamp ${date}: ${error.message}`);
    return null;
  }
}

// Function to normalize heart rate (ensure it's in BPM)
function normalizeHeartRate(heartRateData) {
  if (!heartRateData) return null;
  
  try {
    // Convert string to object if needed
    let data = heartRateData;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    // Create a new object to avoid modifying the original
    const normalized = { ...data };
    
    // Convert from normalized values (0-1) to BPM
    if (normalized.avg_normalized !== undefined && normalized.unit === 'normalized') {
      if (normalized.avg_normalized > 0 && normalized.avg_normalized < 1) {
        const minHr = 40;
        const maxHr = 220;
        const rangeHr = maxHr - minHr;
        normalized.avg_bpm = minHr + (normalized.avg_normalized * rangeHr);
        normalized.unit = 'bpm';
      }
    }
    
    // Standardize the unit
    if (normalized.unit) {
      if (normalized.unit.toLowerCase() === 'bpm' || 
          normalized.unit.toLowerCase() === 'beats_per_minute' || 
          normalized.unit.toLowerCase() === 'beats per minute') {
        normalized.unit = 'bpm';
      }
    } else {
      normalized.unit = 'bpm';
    }
    
    // Copy avg_hr to avg_bpm if needed
    if (normalized.avg_hr && !normalized.avg_bpm) {
      normalized.avg_bpm = normalized.avg_hr;
    }
    
    // Calculate average from data points if needed
    if (!normalized.avg_bpm && normalized.data_points && normalized.data_points.length > 0) {
      const values = normalized.data_points
        .filter(dp => dp.value !== undefined)
        .map(dp => dp.value);
      
      if (values.length > 0) {
        normalized.avg_bpm = values.reduce((a, b) => a + b, 0) / values.length;
      }
    }
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing heart rate: ${error.message}`);
    return heartRateData;
  }
}

// Function to normalize activity data
function normalizeActivity(activityData) {
  if (!activityData) return null;
  
  try {
    // Convert string to object if needed
    let data = activityData;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    // Create a new object to avoid modifying the original
    const normalized = { ...data };
    
    // Normalize distance to meters
    if (normalized.distance) {
      const distance = normalized.distance;
      const distanceUnit = normalized.distance_unit ? normalized.distance_unit.toLowerCase() : 'meters';
      
      // Convert to meters
      if (distanceUnit === 'km' || distanceUnit === 'kilometers') {
        normalized.distance_meters = distance * 1000;
      } else if (distanceUnit === 'mi' || distanceUnit === 'miles') {
        normalized.distance_meters = distance * 1609.34;
      } else if (distanceUnit === 'ft' || distanceUnit === 'feet') {
        normalized.distance_meters = distance * 0.3048;
      } else {
        normalized.distance_meters = distance;
      }
      
      normalized.distance_unit = 'meters';
    }
    
    // Normalize calories
    if (normalized.calories && !normalized.total_calories) {
      normalized.total_calories = normalized.calories;
    } else if (normalized.active_calories && !normalized.total_calories) {
      // Estimate total from active (assuming BMR is about 1800 calories per day)
      if (normalized.duration_ms) {
        const hours = normalized.duration_ms / (1000 * 60 * 60);
        const bmrCalories = (1800 / 24) * hours;
        normalized.total_calories = normalized.active_calories + bmrCalories;
      } else {
        normalized.total_calories = normalized.active_calories;
      }
    }
    
    // Normalize steps (ensure it's an integer)
    if (normalized.steps) {
      normalized.steps = Math.round(Number(normalized.steps));
    }
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing activity data: ${error.message}`);
    return activityData;
  }
}

// Function to normalize sleep data
function normalizeSleep(sleepData) {
  if (!sleepData) return null;
  
  try {
    // Convert string to object if needed
    let data = sleepData;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    // Create a new object to avoid modifying the original
    const normalized = { ...data };
    
    // Normalize sleep duration to milliseconds
    if (normalized.sleep_duration && !normalized.sleep_duration_ms) {
      const duration = normalized.sleep_duration;
      const durationUnit = normalized.duration_unit ? normalized.duration_unit.toLowerCase() : 'seconds';
      
      // Convert to milliseconds
      if (durationUnit === 'seconds' || durationUnit === 's') {
        normalized.sleep_duration_ms = duration * 1000;
      } else if (durationUnit === 'minutes' || durationUnit === 'min') {
        normalized.sleep_duration_ms = duration * 60 * 1000;
      } else if (durationUnit === 'hours' || durationUnit === 'h') {
        normalized.sleep_duration_ms = duration * 60 * 60 * 1000;
      } else {
        normalized.sleep_duration_ms = duration;
      }
      
      normalized.duration_unit = 'ms';
    }
    
    // Normalize sleep stages
    if (normalized.stages) {
      const stages = normalized.stages;
      const normalizedStages = {};
      
      // Common stage mappings
      const stageMapping = {
        light: ['light', 'light_sleep'],
        deep: ['deep', 'deep_sleep', 'slow_wave'],
        rem: ['rem', 'rem_sleep', 'rapid_eye_movement'],
        awake: ['awake', 'wake', 'wakefulness']
      };
      
      // Convert stages to standard format
      for (const [standardStage, variations] of Object.entries(stageMapping)) {
        for (const variation of variations) {
          if (stages[variation] !== undefined) {
            normalizedStages[standardStage] = stages[variation];
          }
        }
      }
      
      normalized.normalized_stages = normalizedStages;
    }
    
    return normalized;
  } catch (error) {
    console.error(`Error normalizing sleep data: ${error.message}`);
    return sleepData;
  }
}

module.exports = {
  convertToUtc,
  normalizeHeartRate,
  normalizeActivity,
  normalizeSleep
};