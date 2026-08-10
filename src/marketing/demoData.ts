export const DEMO_MEMORIES = [
  {
    id: 'demo-snap-1',
    user_id: 'demo-user-id',
    file_name: 'summer-trip-01.jpg',
    file_path: 'demo/summer-trip-01.jpg',
    file_type: 'image',
    mime_type: 'image/jpeg',
    file_size: 102400,
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    is_drive_file: false,
    is_private: false,
    caption: 'Road trip down the coast! 🚗🌊',
    local_uri: 'https://picsum.photos/id/10/1000/1500',
    overlay_metadata: {
      lens: 'time_date',
      locationText: 'Big Sur, California'
    }
  },
  {
    id: 'demo-snap-2',
    user_id: 'demo-user-id',
    file_name: 'summer-trip-02.jpg',
    file_path: 'demo/summer-trip-02.jpg',
    file_type: 'image',
    mime_type: 'image/jpeg',
    file_size: 112400,
    created_at: new Date(Date.now() - 3600000 * 24 * 4).toISOString(),
    is_drive_file: false,
    is_private: false,
    caption: 'Sunset at the campfire 🔥⛺',
    local_uri: 'https://picsum.photos/id/1015/1000/1500',
    overlay_metadata: {
      lens: 'location',
      locationText: 'Yosemite Valley'
    }
  },
  {
    id: 'demo-snap-3',
    user_id: 'demo-user-id',
    file_name: 'family-01.jpg',
    file_path: 'demo/family-01.jpg',
    file_type: 'image',
    mime_type: 'image/jpeg',
    file_size: 98400,
    created_at: new Date(Date.now() - 3600000 * 24 * 10).toISOString(),
    is_drive_file: false,
    is_private: false,
    caption: 'Sunday brunch with family 🥞☕',
    local_uri: 'https://picsum.photos/id/429/1000/1500',
    overlay_metadata: {
      lens: 'date'
    }
  },
  {
    id: 'demo-snap-4',
    user_id: 'demo-user-id',
    file_name: 'summer-trip-video.mp4',
    file_path: 'demo/summer-trip-video.mp4',
    file_type: 'video',
    mime_type: 'video/mp4',
    file_size: 1048576,
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    is_drive_file: false,
    is_private: false,
    caption: 'Cruising through the scenic highways 🛣️✨',
    local_uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    overlay_metadata: {
      lens: 'time'
    }
  },
  {
    id: 'demo-snap-5',
    user_id: 'demo-user-id',
    file_name: 'weekend-01.jpg',
    file_path: 'demo/weekend-01.jpg',
    file_type: 'image',
    mime_type: 'image/jpeg',
    file_size: 102400,
    created_at: new Date(Date.now() - 3600000 * 24 * 1).toISOString(),
    is_drive_file: false,
    is_private: false,
    caption: 'Stunning city views from the rooftop 🏙️✨',
    local_uri: 'https://picsum.photos/id/1057/1000/1500',
    overlay_metadata: {
      lens: 'time_date',
      locationText: 'New York City'
    }
  }
];

export const DEMO_DRIVE_FILES = [
  {
    id: 'demo-drive-1',
    user_id: 'demo-user-id',
    file_name: 'tax-returns.pdf',
    file_path: 'demo/tax-returns.pdf',
    file_type: 'document',
    mime_type: 'application/pdf',
    file_size: 512000,
    created_at: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
    is_drive_file: true,
    is_private: true,
  },
  {
    id: 'demo-drive-2',
    user_id: 'demo-user-id',
    file_name: 'rent-agreement.pdf',
    file_path: 'demo/rent-agreement.pdf',
    file_type: 'document',
    mime_type: 'application/pdf',
    file_size: 256000,
    created_at: new Date(Date.now() - 3600000 * 24 * 15).toISOString(),
    is_drive_file: true,
    is_private: true,
  }
];
