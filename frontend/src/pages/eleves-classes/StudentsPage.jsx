import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import ClassesTab from './ClassesTab'
import StudentsTab from './StudentsTab'

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold">Élèves & classes</h2>
        <p className="text-muted-foreground text-sm">
          Gérez les classes et les élèves de votre établissement
        </p>
      </div>

      <Tabs defaultValue="eleves" className="space-y-6">
        <TabsList>
          <TabsTrigger value="eleves">Élèves</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
        </TabsList>
        <TabsContent value="eleves">
          <StudentsTab />
        </TabsContent>
        <TabsContent value="classes">
          <ClassesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
