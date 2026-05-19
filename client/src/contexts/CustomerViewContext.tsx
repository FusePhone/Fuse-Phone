import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

interface CustomerViewContextType {
  isCustomerView: boolean;
  setCustomerView: (value: boolean) => void;
}

const CustomerViewContext = createContext<CustomerViewContextType>({
  isCustomerView: false,
  setCustomerView: () => {},
});

export function CustomerViewProvider({ children }: { children: ReactNode }) {
  const [isCustomerView, setCustomerView] = useState(false);

  return (
    <CustomerViewContext.Provider value={{ isCustomerView, setCustomerView }}>
      {children}
    </CustomerViewContext.Provider>
  );
}

export function useCustomerView() {
  return useContext(CustomerViewContext);
}
