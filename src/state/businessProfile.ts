export interface BusinessProfile {
  phoneId: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[];
  profilePictureUrl?: string;
  profilePictureId?: string;
}

const profiles = new Map<string, BusinessProfile>();

export const getBusinessProfile = (
  phoneId: string
): BusinessProfile | undefined => profiles.get(phoneId);

export const upsertBusinessProfile = (params: {
  phoneId: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[];
  profilePictureUrl?: string;
  profilePictureId?: string;
}): BusinessProfile => {
  const existing = profiles.get(params.phoneId) ?? {
    phoneId: params.phoneId,
  };

  if (params.address !== undefined) {
    if (params.address) {
      existing.address = params.address;
    } else {
      delete existing.address;
    }
  }
  if (params.description !== undefined) {
    if (params.description) {
      existing.description = params.description;
    } else {
      delete existing.description;
    }
  }
  if (params.email !== undefined) {
    if (params.email) {
      existing.email = params.email;
    } else {
      delete existing.email;
    }
  }
  if (params.vertical !== undefined) {
    if (params.vertical) {
      existing.vertical = params.vertical;
    } else {
      delete existing.vertical;
    }
  }
  if (params.websites !== undefined) {
    if (Array.isArray(params.websites) && params.websites.length > 0) {
      existing.websites = params.websites;
    } else {
      delete existing.websites;
    }
  }
  if (params.profilePictureUrl !== undefined) {
    if (params.profilePictureUrl) {
      existing.profilePictureUrl = params.profilePictureUrl;
    } else {
      delete existing.profilePictureUrl;
    }
  }
  if (params.profilePictureId !== undefined) {
    if (params.profilePictureId) {
      existing.profilePictureId = params.profilePictureId;
    } else {
      delete existing.profilePictureId;
    }
  }

  profiles.set(existing.phoneId, existing);
  return existing;
};
