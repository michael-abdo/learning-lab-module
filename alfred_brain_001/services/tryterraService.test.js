/**
 * TryTerra Service Tests
 * 
 * Tests for the TryTerra API connection service
 */

const axios = require('axios');

// Mock axios before requiring the service
jest.mock('axios', () => {
  const axiosMock = {
    get: jest.fn(),
    post: jest.fn()
  };
  return {
    create: jest.fn(() => axiosMock),
    defaults: {
      headers: { common: {} }
    }
  };
});

// Now import the service after axios is mocked
const tryterraService = require('../../backend/services/tryterraService');

describe('TryTerra API Service', () => {
  // Get the mocked axios instance
  const axiosInstance = axios.create();
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('API authentication', () => {
    test('should authenticate a user with TryTerra', async () => {
      // Mock successful response
      const mockAuthResponse = {
        data: {
          auth_url: 'https://widget.tryterra.co/123',
          resource: { user_id: 'terra_123' }
        }
      };
      
      // Setup the mock to return our response
      axiosInstance.post.mockResolvedValueOnce(mockAuthResponse);
      
      // Try to authenticate
      try {
        const result = await tryterraService.authenticateUser('user_ref_123');
        
        // Check that the post method was called with the right arguments
        expect(axiosInstance.post).toHaveBeenCalledWith('/auth/generateWidgetSession', {
          reference_id: 'user_ref_123',
          providers: expect.any(Array),
          language: 'en'
        });
        
        // Check the returned data
        expect(result).toEqual(mockAuthResponse.data);
      } catch (error) {
        // This should not happen
        console.error(error);
        fail('Authentication should not have failed');
      }
    });
  });

  describe('Data retrieval', () => {
    test('should fetch activity data correctly', async () => {
      // Mock successful response
      const mockActivityResponse = {
        data: {
          data: [
            {
              metadata: {
                start_time: '2023-01-01T00:00:00Z',
                end_time: '2023-01-01T01:00:00Z'
              },
              heart_rate_data: {
                avg_hr_bpm: 75
              }
            }
          ]
        }
      };
      
      // Setup the mock to return our response
      axiosInstance.get.mockResolvedValueOnce(mockActivityResponse);
      
      // Try to get activity data
      try {
        const result = await tryterraService.getActivityData('terra_user_123', '2023-01-01', '2023-01-02');
        
        // Check that the get method was called with the right arguments
        expect(axiosInstance.get).toHaveBeenCalledWith('/activity', {
          params: {
            user_id: 'terra_user_123',
            start_date: '2023-01-01',
            end_date: '2023-01-02',
            to_webhook: false
          }
        });
        
        // Check the returned data
        expect(result).toEqual(mockActivityResponse.data);
      } catch (error) {
        // This should not happen
        console.error(error);
        fail('Activity data fetch should not have failed');
      }
    });
    
    test('should handle API errors gracefully', async () => {
      // Mock failed response
      const errorMessage = 'API Error';
      axiosInstance.get.mockRejectedValueOnce(new Error(errorMessage));
      
      // Try to get activity data
      await expect(tryterraService.getActivityData('terra_user_123', '2023-01-01', '2023-01-02'))
        .rejects
        .toThrow(errorMessage);
    });
  });
});