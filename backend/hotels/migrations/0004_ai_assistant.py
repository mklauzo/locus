from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0003_reservation_is_settled'),
    ]

    operations = [
        migrations.AddField(
            model_name='mailcorrespondence',
            name='sender_email',
            field=models.EmailField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.CreateModel(
            name='AIAssistant',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('llm_model', models.CharField(default='gpt-4o-mini', max_length=100)),
                ('llm_api_key', models.CharField(blank=True, max_length=500)),
                ('system_prompt', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('hotel', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ai_assistants',
                    to='hotels.hotel',
                )),
            ],
            options={
                'db_table': 'ai_assistants',
            },
        ),
        migrations.CreateModel(
            name='AIAssistantDocument',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('content', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('assistant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='documents',
                    to='hotels.aiassistant',
                )),
            ],
            options={
                'db_table': 'ai_assistant_documents',
                'ordering': ['name'],
            },
        ),
    ]
