/**
 * LLM Analysis Service
 * 
 * Service for analyzing wearable data using Large Language Models to generate
 * personalized performance plans and insights.
 */

const axios = require('axios');
require('dotenv').config();

// Models
const PerformancePlan = require('../models/performancePlanModel');
const WearableData = require('../models/wearableDataModel');
const UserFitnessProfile = require('../models/userFitnessProfileModel');

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4';

/**
 * Analyze wearable data and generate a performance plan
 * 
 * @param {string} userId - User ID to generate plan for
 * @param {Date} startDate - Start date for data analysis
 * @param {Date} endDate - End date for data analysis
 * @param {string} planType - Type of plan to generate (athletic, nutritional, mental, comprehensive)
 * @returns {Promise<Object>} - Generated performance plan
 */
async function generatePerformancePlan(userId, startDate, endDate, planType = 'comprehensive') {
  try {
    // Step 1: Fetch the user's fitness profile
    const userProfile = await UserFitnessProfile.findOne({ user_id: userId });
    if (!userProfile) {
      throw new Error(`User fitness profile not found for user ID: ${userId}`);
    }

    // Step 2: Fetch wearable data for the specified date range
    const startOfStartDate = new Date(startDate);
    startOfStartDate.setHours(0, 0, 0, 0);
    
    const endOfEndDate = new Date(endDate);
    endOfEndDate.setHours(23, 59, 59, 999);
    
    const wearableData = await WearableData.find({
      user_id: userId,
      $or: [
        { date: { $gte: startOfStartDate, $lte: endOfEndDate } },
        { start_date: { $gte: startOfStartDate, $lte: endOfEndDate } }
      ]
    }).sort({ date: 1, start_date: 1 });

    if (wearableData.length === 0) {
      throw new Error(`No wearable data found for user ID: ${userId} in the specified date range`);
    }

    // Step 3: Preprocess the data for analysis
    const processedData = preprocessWearableData(wearableData);

    // Step 4: Generate insights using LLM
    const insights = await generateInsightsFromLLM(processedData, userProfile, planType);

    // Step 5: Create a performance plan based on insights
    const plan = await createPlanFromInsights(userId, insights, userProfile, planType, startDate);

    return plan;
  } catch (error) {
    console.error(`Error generating performance plan: ${error.message}`);
    throw error;
  }
}

/**
 * Preprocess wearable data for LLM analysis
 * 
 * @param {Array} wearableData - Array of wearable data documents
 * @returns {Object} - Processed data summary
 */
function preprocessWearableData(wearableData) {
  // Initialize summary object
  const summary = {
    dateRange: {
      start: null,
      end: null
    },
    heartRate: {
      avgDailyResting: 0,
      maxRecorded: 0,
      minRecorded: 0,
      dailyAverages: []
    },
    sleep: {
      avgDuration: 0,
      avgDeepSleep: 0,
      avgRemSleep: 0,
      avgLightSleep: 0,
      avgSleepEfficiency: 0,
      dailySleep: []
    },
    activity: {
      avgDailySteps: 0,
      avgDailyActiveMinutes: 0,
      avgDailyCalories: 0,
      totalDistance: 0,
      dailyActivity: []
    },
    stress: {
      avgStressLevel: 0,
      highStressDays: 0,
      dailyStress: []
    },
    bodyMetrics: {
      weight: 0,
      bodyFat: 0,
      lastRecorded: null
    },
    patterns: {
      weekdayVsWeekend: {},
      timeOfDay: {},
      trendingMetrics: []
    }
  };

  // Set date range
  if (wearableData.length > 0) {
    summary.dateRange.start = wearableData[0].date;
    summary.dateRange.end = wearableData[wearableData.length - 1].date;
  }

  // Process each data point
  let heartRateCount = 0;
  let sleepCount = 0;
  let activityCount = 0;
  let stressCount = 0;
  let bodyMetricsCount = 0;

  const dailyData = {};

  wearableData.forEach(data => {
    const dateKey = data.date.toISOString().split('T')[0];
    
    // Initialize daily data if not exists
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        date: data.date,
        heartRate: null,
        sleep: null,
        activity: null,
        stress: null,
        bodyMetrics: null
      };
    }

    // Extract data from data property if it exists
    const dataContent = data.data || {};

    // Process heart rate data
    if (dataContent.heart_rate || data.heart_rate) {
      const heartRateData = dataContent.heart_rate || data.heart_rate;
      const restingBPM = heartRateData.resting_bpm || (heartRateData.summary ? heartRateData.summary.resting_bpm : null);
      
      if (restingBPM) {
        summary.heartRate.avgDailyResting += restingBPM;
        summary.heartRate.maxRecorded = Math.max(summary.heartRate.maxRecorded, 
          heartRateData.max_bpm || (heartRateData.summary ? heartRateData.summary.max_bpm : 0) || 0);
        summary.heartRate.minRecorded = summary.heartRate.minRecorded === 0 ? 
          (heartRateData.min_bpm || (heartRateData.summary ? heartRateData.summary.min_bpm : 999) || 999) : 
          Math.min(summary.heartRate.minRecorded, 
            heartRateData.min_bpm || (heartRateData.summary ? heartRateData.summary.min_bpm : 999) || 999);

        dailyData[dateKey].heartRate = heartRateData;
        heartRateCount++;
      }
    }

    // Process sleep data
    if (dataContent.sleep || data.sleep) {
      const sleepData = dataContent.sleep || data.sleep;
      const sleepDurationMs = sleepData.sleep_duration_ms || 
        (sleepData.summary ? sleepData.summary.sleep_duration_ms : null);
      
      if (sleepDurationMs) {
        const sleepHours = sleepDurationMs / 3600000;
        const deepSleepHours = (sleepData.deep_sleep_ms || 
          (sleepData.summary ? sleepData.summary.deep_sleep_ms : 0) || 0) / 3600000;
        const remSleepHours = (sleepData.rem_sleep_ms || 
          (sleepData.summary ? sleepData.summary.rem_sleep_ms : 0) || 0) / 3600000;
        const lightSleepHours = (sleepData.light_sleep_ms || 
          (sleepData.summary ? sleepData.summary.light_sleep_ms : 0) || 0) / 3600000;
        
        summary.sleep.avgDuration += sleepHours;
        summary.sleep.avgDeepSleep += deepSleepHours;
        summary.sleep.avgRemSleep += remSleepHours;
        summary.sleep.avgLightSleep += lightSleepHours;
        summary.sleep.avgSleepEfficiency += sleepData.sleep_efficiency || 
          (sleepData.summary ? sleepData.summary.efficiency : 0) || 0;

        dailyData[dateKey].sleep = {
          ...sleepData,
          sleepHours,
          deepSleepHours,
          remSleepHours,
          lightSleepHours
        };
        sleepCount++;
      }
    }

    // Process activity data
    if (dataContent.activity || data.activity) {
      const activityData = dataContent.activity || data.activity;
      
      if (activityData) {
        summary.activity.avgDailySteps += activityData.steps || 0;
        summary.activity.avgDailyActiveMinutes += (activityData.active_duration_ms || 0) / 60000;
        summary.activity.avgDailyCalories += activityData.active_calories || activityData.calories || 0;
        summary.activity.totalDistance += activityData.distance_meters || activityData.distance || 0;

        dailyData[dateKey].activity = activityData;
        activityCount++;
      }
    }

    // Process stress data
    if (dataContent.stress || data.stress) {
      const stressData = dataContent.stress || data.stress;
      
      if (stressData && stressData.avg_stress_level) {
        summary.stress.avgStressLevel += stressData.avg_stress_level;
        if (stressData.avg_stress_level > 70) {
          summary.stress.highStressDays++;
        }

        dailyData[dateKey].stress = stressData;
        stressCount++;
      }
    }

    // Process body metrics
    if (dataContent.body_metrics || dataContent.body || data.body_metrics) {
      const bodyData = dataContent.body_metrics || dataContent.body || data.body_metrics;
      
      if (bodyData && bodyData.weight_kg) {
        summary.bodyMetrics.weight += bodyData.weight_kg;
        summary.bodyMetrics.bodyFat += bodyData.body_fat_percentage || 0;
        summary.bodyMetrics.lastRecorded = data.date;

        dailyData[dateKey].bodyMetrics = bodyData;
        bodyMetricsCount++;
      }
    }
  });

  // Calculate averages
  if (heartRateCount > 0) {
    summary.heartRate.avgDailyResting = Math.round(summary.heartRate.avgDailyResting / heartRateCount);
  }

  if (sleepCount > 0) {
    summary.sleep.avgDuration = +(summary.sleep.avgDuration / sleepCount).toFixed(1);
    summary.sleep.avgDeepSleep = +(summary.sleep.avgDeepSleep / sleepCount).toFixed(1);
    summary.sleep.avgRemSleep = +(summary.sleep.avgRemSleep / sleepCount).toFixed(1);
    summary.sleep.avgLightSleep = +(summary.sleep.avgLightSleep / sleepCount).toFixed(1);
    summary.sleep.avgSleepEfficiency = +(summary.sleep.avgSleepEfficiency / sleepCount).toFixed(1);
  }

  if (activityCount > 0) {
    summary.activity.avgDailySteps = Math.round(summary.activity.avgDailySteps / activityCount);
    summary.activity.avgDailyActiveMinutes = Math.round(summary.activity.avgDailyActiveMinutes / activityCount);
    summary.activity.avgDailyCalories = Math.round(summary.activity.avgDailyCalories / activityCount);
  }

  if (stressCount > 0) {
    summary.stress.avgStressLevel = +(summary.stress.avgStressLevel / stressCount).toFixed(1);
  }

  if (bodyMetricsCount > 0) {
    summary.bodyMetrics.weight = +(summary.bodyMetrics.weight / bodyMetricsCount).toFixed(1);
    summary.bodyMetrics.bodyFat = +(summary.bodyMetrics.bodyFat / bodyMetricsCount).toFixed(1);
  }

  // Convert daily data to arrays and analyze patterns
  summary.heartRate.dailyAverages = Object.values(dailyData)
    .filter(d => d.heartRate)
    .map(d => ({
      date: d.date,
      resting: d.heartRate.resting_bpm || (d.heartRate.summary ? d.heartRate.summary.resting_bpm : null),
      avg: d.heartRate.avg_bpm || (d.heartRate.summary ? d.heartRate.summary.avg_bpm : null),
      max: d.heartRate.max_bpm || (d.heartRate.summary ? d.heartRate.summary.max_bpm : null),
      min: d.heartRate.min_bpm || (d.heartRate.summary ? d.heartRate.summary.min_bpm : null)
    }));

  summary.sleep.dailySleep = Object.values(dailyData)
    .filter(d => d.sleep)
    .map(d => ({
      date: d.date,
      duration: d.sleep.sleepHours,
      deep: d.sleep.deepSleepHours,
      rem: d.sleep.remSleepHours,
      light: d.sleep.lightSleepHours,
      efficiency: d.sleep.sleep_efficiency || (d.sleep.summary ? d.sleep.summary.efficiency : null),
      dayOfWeek: d.date.getDay()
    }));

  summary.activity.dailyActivity = Object.values(dailyData)
    .filter(d => d.activity)
    .map(d => ({
      date: d.date,
      steps: d.activity.steps,
      activeMinutes: (d.activity.active_duration_ms || 0) / 60000,
      calories: d.activity.active_calories || d.activity.calories,
      distance: d.activity.distance_meters || d.activity.distance,
      dayOfWeek: d.date.getDay()
    }));

  summary.stress.dailyStress = Object.values(dailyData)
    .filter(d => d.stress)
    .map(d => ({
      date: d.date,
      level: d.stress.avg_stress_level,
      dayOfWeek: d.date.getDay()
    }));

  // Analyze weekday vs weekend patterns
  if (summary.sleep.dailySleep.length > 0) {
    const weekdaySleep = summary.sleep.dailySleep.filter(d => d.dayOfWeek > 0 && d.dayOfWeek < 6);
    const weekendSleep = summary.sleep.dailySleep.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6);
    
    if (weekdaySleep.length > 0) {
      summary.patterns.weekdayVsWeekend.weekdaySleepAvg = weekdaySleep.reduce((sum, d) => sum + d.duration, 0) / weekdaySleep.length;
    }
    
    if (weekendSleep.length > 0) {
      summary.patterns.weekdayVsWeekend.weekendSleepAvg = weekendSleep.reduce((sum, d) => sum + d.duration, 0) / weekendSleep.length;
    }
  }

  if (summary.activity.dailyActivity.length > 0) {
    const weekdayActivity = summary.activity.dailyActivity.filter(d => d.dayOfWeek > 0 && d.dayOfWeek < 6);
    const weekendActivity = summary.activity.dailyActivity.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6);
    
    if (weekdayActivity.length > 0) {
      summary.patterns.weekdayVsWeekend.weekdayStepsAvg = weekdayActivity.reduce((sum, d) => sum + d.steps, 0) / weekdayActivity.length;
    }
    
    if (weekendActivity.length > 0) {
      summary.patterns.weekdayVsWeekend.weekendStepsAvg = weekendActivity.reduce((sum, d) => sum + d.steps, 0) / weekendActivity.length;
    }
  }

  // Identify trends
  if (summary.heartRate.dailyAverages.length > 6) {
    const recentData = summary.heartRate.dailyAverages.slice(-7);
    const olderData = summary.heartRate.dailyAverages.slice(-14, -7);
    
    if (recentData.length > 0 && olderData.length > 0) {
      const recentAvg = recentData.reduce((sum, d) => sum + (d.resting || 0), 0) / recentData.length;
      const olderAvg = olderData.reduce((sum, d) => sum + (d.resting || 0), 0) / olderData.length;
      
      if (Math.abs(recentAvg - olderAvg) > 3) {
        summary.patterns.trendingMetrics.push({
          metric: 'resting_heart_rate',
          change: recentAvg - olderAvg,
          percentChange: ((recentAvg - olderAvg) / olderAvg) * 100,
          direction: recentAvg > olderAvg ? 'increasing' : 'decreasing'
        });
      }
    }
  }

  return summary;
}

/**
 * Generate insights from LLM using the processed wearable data
 * 
 * @param {Object} processedData - Processed wearable data summary
 * @param {Object} userProfile - User fitness profile
 * @param {string} planType - Type of plan to generate
 * @returns {Promise<Object>} - LLM-generated insights
 */
async function generateInsightsFromLLM(processedData, userProfile, planType) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Create the system prompt
  const systemPrompt = `You are an expert sports scientist, nutritionist, and performance coach specialized in analyzing wearable device data to create personalized performance plans. Your task is to analyze the provided wearable data and user profile to generate insights and recommendations for a ${planType} performance plan.`;

  // Create the user prompt with data
  const userPrompt = `
Please analyze the following wearable data and user profile:

## Date Range
${processedData.dateRange.start?.toISOString().split('T')[0]} to ${processedData.dateRange.end?.toISOString().split('T')[0]}

## User Profile
- Fitness Level: ${userProfile.fitness_level}
- Age: ${userProfile.calculateAge ? userProfile.calculateAge() : 'Unknown'}
- Goals: ${userProfile.fitness_goals?.map(g => g.type).join(', ') || 'None specified'}
- Activity Preferences: ${userProfile.activity_preferences?.map(p => p.activity_type).join(', ') || 'None specified'}
- Health Conditions: ${userProfile.health_conditions?.map(c => c.condition_name).join(', ') || 'None specified'}

## Heart Rate Data
- Average Resting HR: ${processedData.heartRate.avgDailyResting} bpm
- Max Recorded: ${processedData.heartRate.maxRecorded} bpm
- Min Recorded: ${processedData.heartRate.minRecorded} bpm

## Sleep Data
- Average Duration: ${processedData.sleep.avgDuration} hours
- Average Deep Sleep: ${processedData.sleep.avgDeepSleep} hours
- Average REM Sleep: ${processedData.sleep.avgRemSleep} hours
- Average Sleep Efficiency: ${processedData.sleep.avgSleepEfficiency}%

## Activity Data
- Average Daily Steps: ${processedData.activity.avgDailySteps}
- Average Active Minutes: ${processedData.activity.avgDailyActiveMinutes} minutes
- Average Daily Calories: ${processedData.activity.avgDailyCalories} calories
- Total Distance: ${(processedData.activity.totalDistance / 1000).toFixed(1)} km

## Stress Data
- Average Stress Level: ${processedData.stress.avgStressLevel}
- High Stress Days: ${processedData.stress.highStressDays}

## Body Metrics
- Weight: ${processedData.bodyMetrics.weight} kg
- Body Fat: ${processedData.bodyMetrics.bodyFat}%

## Patterns Identified
- Weekday vs Weekend Sleep: Weekday ${processedData.patterns.weekdayVsWeekend.weekdaySleepAvg?.toFixed(1) || 'N/A'} hrs vs Weekend ${processedData.patterns.weekdayVsWeekend.weekendSleepAvg?.toFixed(1) || 'N/A'} hrs
- Weekday vs Weekend Steps: Weekday ${processedData.patterns.weekdayVsWeekend.weekdayStepsAvg?.toFixed(0) || 'N/A'} vs Weekend ${processedData.patterns.weekdayVsWeekend.weekendStepsAvg?.toFixed(0) || 'N/A'}
- Trending Metrics: ${processedData.patterns.trendingMetrics.map(t => `${t.metric} ${t.direction} by ${t.change.toFixed(1)} (${t.percentChange.toFixed(1)}%)`).join(', ') || 'None identified'}

Based on this data, please provide:

1. A comprehensive analysis of the user's current health and fitness status
2. Key areas of strength and concern
3. Specific recommendations for a ${planType} performance plan, including:
${planType === 'athletic' || planType === 'comprehensive' ? 
    '   - Workout types, frequency, intensity, and structure\n   - Target heart rate zones\n   - Recovery strategies' : ''}
${planType === 'nutritional' || planType === 'comprehensive' ? 
    '   - Nutritional recommendations and meal timing\n   - Caloric and macronutrient targets\n   - Hydration guidelines' : ''}
${planType === 'mental' || planType === 'comprehensive' ? 
    '   - Mental performance practices\n   - Stress management techniques\n   - Sleep optimization strategies' : ''}
4. Data-based modifications that should be triggered based on specific wearable metrics
5. A structured performance plan formatted as a JSON object

Format your response as a JSON object with the following structure:
{
  "analysis": {
    "overall_health_status": "",
    "strengths": [],
    "concerns": [],
    "data_quality_issues": []
  },
  "recommendations": {
    "athletic": {},
    "nutritional": {},
    "mental": {},
    "recovery": {}
  },
  "data_based_modifications": [],
  "performance_plan": {}
}`;

  try {
    // Make API call to OpenAI
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 3000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    // Parse the response
    const responseContent = response.data.choices[0].message.content;
    let jsonResponse;
    
    try {
      jsonResponse = JSON.parse(responseContent);
    } catch (e) {
      console.error('Error parsing LLM response:', e);
      // Try to extract JSON from the text response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }
    
    return jsonResponse;
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw new Error(`Failed to generate insights from LLM: ${error.message}`);
  }
}

/**
 * Create a performance plan from LLM-generated insights
 * 
 * @param {string} userId - User ID
 * @param {Object} insights - LLM-generated insights
 * @param {Object} userProfile - User fitness profile
 * @param {string} planType - Type of plan to generate
 * @param {Date} startDate - Start date for the plan
 * @returns {Promise<Object>} - Created performance plan
 */
async function createPlanFromInsights(userId, insights, userProfile, planType, startDate) {
  // Initialize a new performance plan
  const plan = new PerformancePlan({
    user_id: userId,
    plan_name: `${planType.charAt(0).toUpperCase() + planType.slice(1)} Performance Plan`,
    plan_type: planType,
    start_date: startDate,
    duration_days: 28, // 4-week plan by default
    status: 'draft',
    generated_by: 'ai',
    generation_method: 'llm_wearable_analysis'
  });

  // Set athletic plan if applicable
  if ((planType === 'athletic' || planType === 'comprehensive') && insights.recommendations.athletic) {
    plan.athletic_plan = {
      goal: insights.recommendations.athletic.goal || 'Improve overall fitness',
      focus_areas: insights.recommendations.athletic.focus_areas || [],
      workouts: insights.performance_plan.workouts || [],
      metrics_to_track: insights.recommendations.athletic.metrics_to_track || [],
      notes: insights.recommendations.athletic.notes || ''
    };
  }

  // Set nutritional plan if applicable
  if ((planType === 'nutritional' || planType === 'comprehensive') && insights.recommendations.nutritional) {
    plan.nutritional_plan = {
      goal: insights.recommendations.nutritional.goal || 'Optimize nutrition for performance',
      daily_calorie_target: insights.recommendations.nutritional.daily_calorie_target,
      macronutrient_split: insights.recommendations.nutritional.macronutrient_split || {},
      hydration_target_ml: insights.recommendations.nutritional.hydration_target_ml,
      supplement_recommendations: insights.recommendations.nutritional.supplements || [],
      notes: insights.recommendations.nutritional.notes || ''
    };

    // If meal plan is provided in the insights
    if (insights.performance_plan.meal_plan) {
      plan.nutritional_plan.meal_plan = insights.performance_plan.meal_plan;
    }
  }

  // Set mental performance plan if applicable
  if ((planType === 'mental' || planType === 'comprehensive') && insights.recommendations.mental) {
    plan.mental_performance_plan = {
      goal: insights.recommendations.mental.goal || 'Improve mental performance',
      practices: insights.performance_plan.mental_practices || [],
      focus_areas: insights.recommendations.mental.focus_areas || [],
      notes: insights.recommendations.mental.notes || ''
    };
  }

  // Set recovery plan if applicable
  if (insights.recommendations.recovery) {
    plan.recovery_plan = {
      goal: insights.recommendations.recovery.goal || 'Optimize recovery and prevent injury',
      practices: insights.performance_plan.recovery_practices || [],
      sleep_recommendations: insights.recommendations.recovery.sleep || {},
      notes: insights.recommendations.recovery.notes || ''
    };
  }

  // Add data-based modifications
  if (insights.data_based_modifications && Array.isArray(insights.data_based_modifications)) {
    insights.data_based_modifications.forEach(mod => {
      plan.data_based_modifications.push({
        metric: mod.metric,
        condition: mod.condition,
        action: mod.action,
        priority: mod.priority || 'medium'
      });
    });
  }

  // Add monitoring instructions
  if (insights.recommendations.monitoring) {
    plan.monitoring_instructions = insights.recommendations.monitoring;
  }

  // Check if expert advisor is enabled
  const expertAdvisorService = require('./expertAdvisorService');
  const notificationService = require('./notificationService');
  
  const isExpertMode = await expertAdvisorService.isExpertAdvisorEnabled();
  
  if (isExpertMode) {
    plan.review_status = 'pending_review';
    console.log('Expert advisor mode enabled. Plan will be sent for expert review.');
    
    // Save the plan
    await plan.save();
    
    // Notify experts about the new plan
    await notificationService.notifyExpertsOfNewPlan(plan._id, planType);
    
    return plan;
  } else {
    // No expert review needed
    plan.review_status = 'approved';
    
    // Save the plan
    await plan.save();
    return plan;
  }
}

/**
 * Generate insights from a specific performance plan
 * 
 * @param {string} planId - Performance plan ID
 * @returns {Promise<Object>} - Insights and recommendations
 */
async function generatePlanInsights(planId) {
  try {
    const plan = await PerformancePlan.findById(planId);
    if (!plan) {
      throw new Error(`Performance plan not found with ID: ${planId}`);
    }

    // Get the user profile
    const userProfile = await UserFitnessProfile.findOne({ user_id: plan.user_id });
    if (!userProfile) {
      throw new Error(`User fitness profile not found for user ID: ${plan.user_id}`);
    }

    // Get the most recent wearable data
    const recentData = await WearableData.find({
      user_id: plan.user_id,
      $or: [
        { date: { $lte: new Date() } },
        { start_date: { $lte: new Date() } }
      ]
    }).sort({ date: -1, start_date: -1 }).limit(7);

    if (recentData.length === 0) {
      throw new Error(`No recent wearable data found for user ID: ${plan.user_id}`);
    }

    // Process the data
    const processedData = preprocessWearableData(recentData);

    // Generate an analysis prompt
    const systemPrompt = 'You are an expert performance coach analyzing the effectiveness of a personalized performance plan based on wearable data.';
    
    const userPrompt = `
Please analyze the following performance plan and recent wearable data:

## Performance Plan
- Type: ${plan.plan_type}
- Start Date: ${plan.start_date.toISOString().split('T')[0]}
- Status: ${plan.status}

${plan.athletic_plan ? `
## Athletic Plan
- Goal: ${plan.athletic_plan.goal}
- Focus Areas: ${plan.athletic_plan.focus_areas?.join(', ')}
- Number of Workouts: ${plan.athletic_plan.workouts?.length || 0}
` : ''}

${plan.nutritional_plan ? `
## Nutritional Plan
- Goal: ${plan.nutritional_plan.goal}
- Calorie Target: ${plan.nutritional_plan.daily_calorie_target}
- Macronutrient Split: Protein ${plan.nutritional_plan.macronutrient_split?.protein_percentage}%, Carbs ${plan.nutritional_plan.macronutrient_split?.carbs_percentage}%, Fat ${plan.nutritional_plan.macronutrient_split?.fat_percentage}%
` : ''}

${plan.mental_performance_plan ? `
## Mental Performance Plan
- Goal: ${plan.mental_performance_plan.goal}
- Focus Areas: ${plan.mental_performance_plan.focus_areas?.join(', ')}
` : ''}

## Recent Wearable Data (Last 7 Days)
- Average Resting HR: ${processedData.heartRate.avgDailyResting} bpm
- Average Sleep Duration: ${processedData.sleep.avgDuration} hours
- Average Daily Steps: ${processedData.activity.avgDailySteps}
- Average Stress Level: ${processedData.stress.avgStressLevel}

Based on this information, please provide:

1. An analysis of the user's adherence to the plan
2. Potential plan adjustments based on the recent wearable data
3. Recommendations for improving effectiveness
4. Any concerns or red flags that should be addressed

Format your response as a JSON object with the following structure:
{
  "adherence_analysis": {
    "overall_adherence": "",
    "strengths": [],
    "areas_for_improvement": []
  },
  "plan_adjustments": [],
  "recommendations": [],
  "concerns": []
}`;

    // Make API call to OpenAI
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    // Parse the response
    const responseContent = response.data.choices[0].message.content;
    let jsonResponse;
    
    try {
      jsonResponse = JSON.parse(responseContent);
    } catch (e) {
      console.error('Error parsing LLM response:', e);
      // Try to extract JSON from the text response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }
    
    return jsonResponse;
  } catch (error) {
    console.error(`Error generating plan insights: ${error.message}`);
    throw error;
  }
}

/**
 * Generate a revised performance plan based on expert feedback
 * @param {string} planId - ID of the plan to revise
 * @param {string} feedback - Expert feedback for revision
 * @returns {Promise<Object>} - Revised performance plan
 */
async function generateRevisedPerformancePlan(planId, feedback) {
  try {
    // Fetch the original plan
    const originalPlan = await PerformancePlan.findById(planId)
      .populate('reviewed_by', 'name email role')
      .lean();
    
    if (!originalPlan) {
      throw new Error(`Performance plan not found with ID: ${planId}`);
    }
    
    // Create revision prompt with original plan and expert feedback
    const systemPrompt = `You are an expert sports scientist revising a performance plan based on professional feedback.`;
    
    const userPrompt = `
    I need you to revise a performance plan based on expert feedback.
    
    ## Original Plan
    ${JSON.stringify(originalPlan, null, 2)}
    
    ## Expert Feedback
    ${feedback}
    
    Please generate a revised version of this performance plan that addresses all the expert's feedback and concerns.
    Return the complete revised plan as a JSON object with the same structure as the original plan.
    `;
    
    // Call OpenAI with revision prompt
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 4000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    
    // Parse the response
    const responseContent = response.data.choices[0].message.content;
    let revisedPlan;
    
    try {
      revisedPlan = JSON.parse(responseContent);
    } catch (e) {
      console.error('Error parsing LLM revision response:', e);
      // Try to extract JSON from the text response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        revisedPlan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }
    
    // Update the original plan with the revised content
    const updatedPlan = await PerformancePlan.findById(planId);
    
    // Apply revisions to plan fields
    if (revisedPlan.athletic_plan) {
      updatedPlan.athletic_plan = revisedPlan.athletic_plan;
    }
    
    if (revisedPlan.nutritional_plan) {
      updatedPlan.nutritional_plan = revisedPlan.nutritional_plan;
    }
    
    if (revisedPlan.mental_performance_plan) {
      updatedPlan.mental_performance_plan = revisedPlan.mental_performance_plan;
    }
    
    if (revisedPlan.recovery_plan) {
      updatedPlan.recovery_plan = revisedPlan.recovery_plan;
    }
    
    if (revisedPlan.data_based_modifications) {
      updatedPlan.data_based_modifications = revisedPlan.data_based_modifications;
    }
    
    // Update metadata
    updatedPlan.review_status = 'pending_review';
    updatedPlan.updated_at = new Date();
    
    await updatedPlan.save();
    return updatedPlan;
  } catch (error) {
    console.error(`Error generating revised performance plan: ${error.message}`);
    throw error;
  }
}

module.exports = {
  generatePerformancePlan,
  generatePlanInsights,
  preprocessWearableData,
  generateInsightsFromLLM,
  generateRevisedPerformancePlan
};