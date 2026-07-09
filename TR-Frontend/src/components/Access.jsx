import React from 'react';
import { useAccess } from '../hooks/useAccess';

export function Access({ action, children, fallback = null }) {
  const { checkAccess } = useAccess();
  
  if (!checkAccess(action)) {
    return fallback; 
  }
  
  return children;
}