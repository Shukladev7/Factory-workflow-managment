'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Employee, type Role } from '@/lib/types';
import { ROLE_LABELS, getRolePermissions } from '@/lib/permissions';
import { useEffect } from 'react';

const formSchema = z.object({
  uid: z.string(),
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  role: z.enum(['admin', 'storeManager', 'mouldingManager', 'machiningManager', 'assemblingManager', 'testingManager'], {
    required_error: 'Please select a role.',
  }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  createdAt: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof formSchema>;

interface EmployeeFormProps {
    employee: Employee | null;
    onEmployeeSaved: (employee: Employee) => void;
}

export function EmployeeForm({ employee, onEmployeeSaved }: EmployeeFormProps) {
  const getInitialValues = (): Partial<EmployeeFormValues> => {
    if (employee) {
      return {
        uid: employee.uid,
        name: employee.name,
        role: employee.role,
        email: employee.email,
        createdAt: employee.createdAt,
      };
    }
    return {
      uid: '',
      name: '',
      email: '',
      createdAt: new Date().toISOString(),
    };
  };

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getInitialValues(),
  });
  
  const selectedRole = form.watch('role');
  
  useEffect(() => {
    const initialValues = getInitialValues();
    form.reset(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  function onSubmit(data: EmployeeFormValues) {
    const employeeData: Employee = {
      uid: data.uid,
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    onEmployeeSaved(employeeData);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employee Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="e.g., john.doe@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Assign a role to determine this employee&apos;s permissions.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {selectedRole && (
          <Card>
            <CardHeader>
              <CardTitle>Role Permissions</CardTitle>
              <CardDescription>
                The following permissions are assigned to the {ROLE_LABELS[selectedRole as Role]} role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-blue-700">Can View:</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      All Modules (Full View Access)
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-green-700">Can Edit:</h4>
                  <div className="flex flex-wrap gap-2">
                    {getRolePermissions(selectedRole as Role).canEdit.map((module) => (
                      <span
                        key={module}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                      >
                        {module}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        <div className="flex justify-end">
          <Button type="submit">Save Employee</Button>
        </div>
      </form>
    </Form>
  );
}
