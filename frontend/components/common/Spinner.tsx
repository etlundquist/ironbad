import React from 'react'

interface SpinnerProps {
  size?: 'small' | 'large'
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'small' }) => {
  return <div className={`spinner ${size}`}></div>
}

