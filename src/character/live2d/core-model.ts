// The subset of the Cubism 4 framework CubismModel this layer touches.

export interface CoreModel {
  getParameterValueById(id: string): number
  setParameterValueById(id: string, value: number, weight?: number): void
  addParameterValueById(id: string, value: number, weight?: number): void
  getParameterIndex(id: string): number
  getParameterDefaultValue(index: number): number
  getParameterMinimumValue(index: number): number
  getParameterMaximumValue(index: number): number
  getParameterCount(): number
  setPartOpacityById(id: string, opacity: number): void
}
